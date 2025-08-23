import { parentPort, workerData } from 'worker_threads';
import { codeGen, test_ast } from './e2jast.js';

const { script } = workerData;

try {
    const generatedCode = codeGen(test_ast(script));
    parentPort.postMessage({ status: 'success', code: generatedCode });
} catch (error) {
    // 오류 정보를 직렬화하여 부모 스레드로 전달
    parentPort.postMessage({ status: 'error', error: { message: error.message, stack: error.stack } });
}