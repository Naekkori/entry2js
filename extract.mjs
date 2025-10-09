// F:/kkori/entry2js/extract.mjs

import { promises as fs } from 'fs';
import path from 'path';
import * as tar from 'tar';

/**
 * ... (기존 주석)
 * @param {(message: string) => void} [onProgress] - 진행 상황을 보고하는 콜백 함수
 */
const extractPlayEntryProject = async (entFilePath, outputDir, onProgress = () => {}, IsScriptOnly = false) => {
  try {
    await fs.access(entFilePath);
  } catch {
    throw new Error(`File not found: ${entFilePath}`);
  }

  onProgress(`출력 디렉토리 확인: ${outputDir}`);
  onProgress(`기존 출력 디렉토리 정리 중...`);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  onProgress(`출력 디렉토리 생성 완료.`);

  try {
    onProgress(`압축 해제 시작: ${path.basename(entFilePath)}`);
    const extractOptions = {
      file: entFilePath,
      cwd: outputDir,
      // 각 파일이 압축 해제될 때마다 onProgress 콜백을 호출합니다.
      onentry: (entry) => onProgress(`  > ${entry.path}`),
    };

    if (IsScriptOnly) {
        await tar.extract(extractOptions, ['temp/project.json']);
    } else {
        await tar.extract(extractOptions);
    }
    onProgress(`압축 해제 완료.`);

    const projectJsonPath = path.join(outputDir,"temp", 'project.json');
    try {
      await fs.access(projectJsonPath);
    } catch {
      onProgress('[경고] project.json 파일을 찾을 수 없습니다.');
    }

    // temp 폴더의 내용을 상위 폴더로 옮기고 temp 폴더 삭제
    const tempDirPath = path.join(outputDir, "temp");
    try {
      const files = await fs.readdir(tempDirPath);
      onProgress(`'temp' 폴더 내용 상위 폴더로 이동 중...`);
      for (const file of files) {
        const sourcePath = path.join(tempDirPath, file);
        const destPath = path.join(outputDir, file);
        await fs.rename(sourcePath, destPath);
        onProgress(`  > ${file} 이동 완료.`);
      }
      onProgress(`비어있는 'temp' 폴더 삭제 중...`);
      await fs.rmdir(tempDirPath);
      onProgress(`'temp' 폴더 정리 완료.`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        onProgress(`'temp' 폴더를 찾을 수 없습니다. 이동할 내용이 없습니다.`);
      } else {
        throw error;
      }
    }
    const finalProjectJsonPath = path.join(outputDir, 'project.json');

    const projectJsonContent = await fs.readFile(finalProjectJsonPath, 'utf8');
    const projectJson = JSON.parse(projectJsonContent);

    if (Array.isArray(projectJson.objects)) {
      for (const obj of projectJson.objects) {
        if (obj && obj.sprite) {
          if (Array.isArray(obj.sprite.pictures)) {
            for (const pic of obj.sprite.pictures) {
              if (pic && typeof pic.fileurl === 'string' && pic.fileurl.startsWith('temp/')) {
                pic.fileurl = pic.fileurl.slice(5);
              }
            }
          }

          // 'sounds' 배열 처리
          if (Array.isArray(obj.sprite.sounds)) {
            for (const sound of obj.sprite.sounds) {
              if (sound && typeof sound.fileurl === 'string' && sound.fileurl.startsWith('temp/')) {
                sound.fileurl = sound.fileurl.slice(5);
              }
            }
          }
        }
      }
    }

    await fs.writeFile(finalProjectJsonPath, JSON.stringify(projectJson, null, 2));

    onProgress(`'project.json' 파일 내의 경로를 성공적으로 수정했습니다.`);

  } catch (error) {
    console.error('Error during extraction:', error);
    onProgress(`압축 해제 중 오류 발생: ${error.message}`);
    throw error;
  }
};
export { extractPlayEntryProject };