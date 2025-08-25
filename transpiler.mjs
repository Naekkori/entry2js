import fs from "fs";
import path from "node:path";
import { Worker } from 'worker_threads';

/**
 * 워커 스레드에서 변환 작업을 실행하고 타임아웃을 적용합니다.
 * @param {object} script - 변환할 스크립트 객체
 * @param {(message: string) => void} [onProgress] - 진행 상황을 보고하는 콜백 함수
 * @param {number} timeout - 타임아웃 시간 (ms)
 * @returns {Promise<string>} 변환된 코드
 */
function transpileInWorker(script, onProgress, timeout = 5000) { // 5초 타임아웃
     return new Promise((resolve, reject) => {
    const worker = new Worker('./transpiler-worker.mjs', {
      workerData: { script }
    });
    worker.on('message', (result) => {
      switch (result.status) {
        case 'progress':
          // 워커로부터 진행 상황 메시지를 받으면 onProgress 콜백 호출
          if (onProgress) onProgress(`  > ${result.message} ${worker.length}/`);
          break;
        case 'success':
          resolve(result.code);
          break;
        case 'error':
          // 오류 객체를 다시 생성하여 스택 트레이스를 보존
          const error = new Error(result.error.message);
          error.stack = result.error.stack;
          reject(error);
          break;
      }
    });

    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

const Transpiler = async (Jsonpath, onProgress) => {
    const withoutProjectJson = Jsonpath.replace(/project\.json$/, '');
    if (!fs.existsSync(Jsonpath)) {
        throw new Error(`File not found: ${Jsonpath}`);
    }
    const scriptDir = path.join(withoutProjectJson, 'script');
    if (!fs.existsSync(scriptDir)) {
        fs.mkdirSync(scriptDir);
    }
    //project JSON 파싱
    const projectJson = JSON.parse(fs.readFileSync(Jsonpath, 'utf8'));
    if (Array.isArray(projectJson.objects)) {
        for (const obj of projectJson.objects) {
            if (obj && obj.script && obj.script.length != 0) {
                const message = `오브젝트 '${obj.name}' (ID: ${obj.id}) 스크립트 생성 중...`;
                if (onProgress) onProgress(message);
                try {
                    const generatedCode = await transpileInWorker(obj.script, onProgress, 5000);
                    await fs.promises.writeFile(path.join(scriptDir, `object_${obj.id}.js`), generatedCode);
                    const successMessage = `✅ 오브젝트 '${obj.name}' (ID: ${obj.id}) 스크립트 생성 완료.`;
                    if (onProgress) onProgress(successMessage);
                } catch (error) {
                    const errorMessage = `❌ 오브젝트 '${obj.name}' (ID: ${obj.id}) 처리 중 오류 발생: ${error.message}`;
                    if (onProgress) onProgress(errorMessage);
                    await fs.promises.writeFile(path.join(scriptDir, `js_${obj.id}.error.log`), error.stack);
                }
            }
        }
    }
}
export default Transpiler