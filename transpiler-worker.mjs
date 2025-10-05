import { parentPort, workerData } from 'worker_threads';
import { codeGen, test_ast } from './e2jast.js';

/**
 * 이 워커는 메인 스레드로부터 스크립트(와 선택적으로 함수 ID)를 받아 변환 작업을 수행합니다.
 * UI 스레드의 블로킹을 방지하기 위해 별도의 스레드에서 실행됩니다.
 */
try {
    // workerData는 항상 { script: '...', functionId: '...' (선택적) } 형태의 객체입니다.
    const script = workerData.script;
    const functionId = workerData.functionId; // 함수가 아니면 undefined가 됩니다.
    const isFunction = !!functionId;

    if (!script) {
        throw new Error('워커에 전달된 스크립트가 없습니다.');
    }

    // AST 생성
    parentPort.postMessage({ status: 'progress', message: 'AST 생성 중...' });
    const ast = test_ast(script, functionId); // 함수 ID를 AST 생성기에 전달

    // 코드 생성
    parentPort.postMessage({ status: 'progress', message: '코드 생성 중...' });
    const generatedCode = codeGen(ast);

    // 성공 결과 전송
    parentPort.postMessage({ status: 'success', code: generatedCode });

} catch (error) {
    // 에러 결과 전송
    parentPort.postMessage({
        status: 'error',
        error: { message: error.message, stack: error.stack }
    });
}