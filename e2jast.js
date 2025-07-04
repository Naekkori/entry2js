//추상 구문 트리
import fs from "fs";

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
const HEADER = `
/*

███████╗███╗   ██╗████████╗██████╗ ██╗   ██╗██████╗      ██╗███████╗
██╔════╝████╗  ██║╚══██╔══╝██╔══██╗╚██╗ ██╔╝╚════██╗     ██║██╔════╝
█████╗  ██╔██╗ ██║   ██║   ██████╔╝ ╚████╔╝  █████╔╝     ██║███████╗
██╔══╝  ██║╚██╗██║   ██║   ██╔══██╗  ╚██╔╝  ██╔═══╝ ██   ██║╚════██║
███████╗██║ ╚████║   ██║   ██║  ██║   ██║   ███████╗╚█████╔╝███████║
╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ╚══════╝ ╚════╝ ╚══════╝
                                                                    
CodeGenerator ${pkg.version} by ${pkg.author}
For advanced users
If you know what this code is doing, I recommend modifying it.
This is the code that works in FastEntry
*/
`;

/**
 * 엔트리 스크립트 JSON 문자열을 받아 AST(추상 구문 트리)를 생성합니다.
 * @param {string} entryScript - 파싱할 스크립트 JSON 문자열
 * @returns {Array} - 생성된 AST
 */
function buildAstFromScript(entryScript) {
    // 1. 함수가 호출될 때마다 새로운 로컬 배열을 생성합니다. (전역 변수 문제 해결)
    const localAst = [];
    if (!entryScript) return localAst;

    const scriptData = JSON.parse(entryScript);

    // 2. 2차원 배열 구조를 올바르게 순회합니다.
    if (Array.isArray(scriptData)) {
        for (const blockStack of scriptData) { // 바깥쪽 배열 순회 (블록 묶음)
            // 첫 번째 블록이 'when_run_button_click' 또는 'when_some_key_press'와 같이 시작 블록인지 확인합니다.
            // 연결되지 않은 스크립트는 AST에서 버립니다.
            const firstBlock = blockStack[0];
            if (!firstBlock || typeof firstBlock.type !== 'string') {
                continue; // 유효하지 않은 블록 스택은 건너뜁니다.
            }

            // 시작 블록 유형을 확인합니다.
            const isStartBlock = firstBlock.type.startsWith('when_'); // 'when_run_button_click', 'when_some_key_press' 등

            if (isStartBlock) {
                const astStack = [];
                if (Array.isArray(blockStack)) {
                    for (const block of blockStack) { // 안쪽 배열 순회 (개별 블록)
                        if (block && typeof block.type === 'string') {
                            // 3. AST 노드에 더 많은 정보를 담습니다.
                            astStack.push({
                                type: block.type,
                                params: block.params,
                                // statements는 나중에 재귀적으로 처리할 수 있습니다.
                                statements: block.statements
                            });
                        }
                    }
                }
                if (astStack.length > 0) {
                    localAst.push(astStack);
                }
            }
        }
    }
    return localAst;
}

/**
 * AST를 기반으로 최종 코드를 생성하는 함수 (향후 구현)
 * @param {Array} ast - buildAstFromScript로 생성된 AST
 * @returns {string} - 변환된 JavaScript 코드
 */
function codeGen(ast) {
    // TODO: AST를 순회하며 실제 JavaScript 코드를 생성하는 로직 구현
    // return HEADER + generatedCode;
    return ast; // 임시로 AST 자체를 반환
}

// 테스트용 함수는 이제 buildAstFromScript를 호출하기만 합니다.
function test_ast(entryScript) {
    // 나중에는 codeGen(ast)를 호출하게 될 것입니다.
    return buildAstFromScript(entryScript);
}

export { codeGen, test_ast };