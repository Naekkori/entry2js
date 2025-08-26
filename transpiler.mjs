import fs from "fs";
import path from "node:path";
import { Worker } from 'worker_threads';

function transpileInWorker(script, onProgress, timeout = 5000) {
    if (transpileInWorker.state === undefined) {
        transpileInWorker.state = {
            started: 0,
            processed: 0,
        };
    }
    const state = transpileInWorker.state;
    state.started++;
    const workerIndex = state.started;

    const promise = new Promise((resolve, reject) => {
        const worker = new Worker('./transpiler-worker.mjs', {
            workerData: { script }
        });
        worker.on('message', (result) => {
            switch (result.status) {
                case 'progress':
                    if (onProgress) onProgress(`  > [워커 ${workerIndex}] ${result.message}`);
                    break;
                case 'success':
                    resolve(result.code);
                    break;
                case 'error':
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

    const onSettled = (status) => {
        state.processed++;
        const total = state.started;
        if (onProgress) {
            onProgress(`[${state.processed}/${total}] ${status} (워커 ${workerIndex})`);
        }
        if (state.processed === total) {
            transpileInWorker.state = undefined;
        }
    };

    return promise.then(
        (code) => {
            onSettled('완료');
            return code;
        },
        (err) => {
            onSettled('실패');
            throw err;
        }
    );
}

const Transpiler = async (Jsonpath, onProgress) => {
    const withoutProjectJson = Jsonpath.replace(/project\.json$/, '');
    if (!fs.existsSync(Jsonpath)) {
        throw new Error(`File not found: ${Jsonpath}`);
    }
    const scriptDir = path.join(withoutProjectJson, 'script');
    if (!fs.existsSync(scriptDir)) {
        fs.mkdirSync(scriptDir, { recursive: true });
    }
    const projectJson = JSON.parse(fs.readFileSync(Jsonpath, 'utf8'));

    if (Array.isArray(projectJson.objects)) {
        const objectsToProcess = projectJson.objects.filter(obj => obj && obj.script && obj.script.length > 0);

        if (objectsToProcess.length > 0 && onProgress) {
            onProgress(`총 ${objectsToProcess.length}개의 오브젝트를 병렬로 변환합니다.`);
        }

        const promises = objectsToProcess.map(obj => {
            return transpileInWorker(obj.script, onProgress, 5000)
                .then(generatedCode => {
                    return fs.promises.writeFile(path.join(scriptDir, `object_${obj.id}.js`), generatedCode);
                })
                .catch(error => {
                    const errorMessage = `❌ 오브젝트 '${obj.name}' (ID: ${obj.id}) 처리 중 오류 발생: ${error.message}`;
                    if (onProgress) onProgress(errorMessage);
                    const errorStack = error.stack || error.toString();
                    return fs.promises.writeFile(path.join(scriptDir, `object_${obj.id}.error.log`), errorStack);
                });
        });

        // 모든 변환 작업이 완료될 때까지 기다립니다.
        await Promise.all(promises);
    }

    // 처리할 오브젝트가 없으면 아무것도 하지 않습니다.
};

export default Transpiler;