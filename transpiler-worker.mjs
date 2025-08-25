import { parentPort, workerData } from 'worker_threads';
import { codeGen, test_ast } from './e2jast.js';

const { script } = workerData;

try {
    parentPort.postMessage({ status: 'progress', message: 'AST(추상 구문 트리)로 변환 중...' });
    const ast = test_ast(script);
    parentPort.postMessage({ status: 'progress', message: 'JavaScript 코드로 변환 중...' });
    const generatedCode = codeGen(ast);
    parentPort.postMessage({ status: 'success', code: generatedCode });
} catch (error) {
    // 오류 정보를 직렬화하여 부모 스레드로 전달
    parentPort.postMessage({ status: 'error', error: { message: error.message, stack: error.stack } });
}