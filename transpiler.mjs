import fs from "fs";
import path from "node:path";
import { Worker } from 'worker_threads';

/**
 * 워커 스레드에서 변환 작업을 실행하고 타임아웃을 적용합니다.
 * @param {object} script - 변환할 스크립트 객체
 * @param {number} timeout - 타임아웃 시간 (ms)
 * @returns {Promise<string>} 변환된 코드
 */
function transpileInWorker(script, timeout = 5000) { // 5초 타임아웃
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./transpiler-worker.mjs', import.meta.url), {
            workerData: { script }
        });

        const timer = setTimeout(() => {
            worker.terminate();
            reject(new Error(`변환 작업이 ${timeout}ms를 초과하여 중단되었습니다.`));
        }, timeout);

        worker.on('message', (message) => {
            clearTimeout(timer);
            if (message.status === 'success') {
                resolve(message.code);
            } else {
                const err = new Error(message.error.message);
                err.stack = message.error.stack;
                reject(err);
            }
        });

        worker.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
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
                    const generatedCode = await transpileInWorker(obj.script, 5000);
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