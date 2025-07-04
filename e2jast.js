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
 * @returns {object} - 생성된 AST (최상위 Program 노드)
 */
function buildAstFromScript(entryScript) {
    // 최상위 Program 노드를 생성합니다.
    const programAst = {
        type: "Program",
        body: [] // 프로그램 본문, 이벤트 핸들러 및 기타 최상위 구문 포함
    };

    if (!entryScript) {
        return programAst;
    }

    const scriptData = JSON.parse(entryScript);

    if (Array.isArray(scriptData)) {
        for (const blockStack of scriptData) { // 바깥쪽 배열 순회 (블록 묶음)
            const firstBlock = blockStack[0];

            if (!firstBlock || typeof firstBlock.type !== 'string') {
                continue; // 유효하지 않은 블록 스택은 건너뜁니다.
            }

            const isStartBlock = firstBlock.type.startsWith('when_');

            if (isStartBlock) {
                // 시작 블록이라면 EventHandler 노드를 생성합니다.
                const eventName = firstBlock.type.replace('when_', ''); // 'when_click_start' -> 'click_start'
                const handlerBody = [];

                // 'when_click_start' 블록의 경우, statements 배열이 비어있다는 전제 조건에 따라
                // 첫 번째 블록 자체에는 statements를 포함하지 않습니다.
                // 그러나 해당 스택의 두 번째 블록부터는 handlerBody에 추가되어야 합니다.

                if (Array.isArray(blockStack)) {
                    // 첫 번째 블록은 이미 EventHandler 노드의 메타데이터로 사용되었으므로,
                    // 두 번째 블록부터 실제 handlerBody에 추가합니다.
                    for (let i = 1; i < blockStack.length; i++) {
                        const block = blockStack[i];
                        if (block && typeof block.type === 'string') {
                            // 개별 블록을 AST 노드로 변환합니다.
                            // statements는 재귀적으로 처리될 수 있도록 구조를 유지합니다.
                            handlerBody.push(convertBlockToAstNode(block));
                        }
                    }
                }

                programAst.body.push({
                    type: "EventHandler",
                    eventName: eventName,
                    handlerBody: handlerBody
                });
            } else {
                // 시작 블록이 아닌 경우 (예: 전역 변수 선언 등, 현재는 건너뜀)
                // TODO: 여기에 시작 블록이 아닌 최상위 레벨 블록 처리를 추가할 수 있습니다.
            }
        }
    }
    return programAst;
}

/**
 * 단일 엔트리 블록 객체를 해당 AST 노드로 변환합니다.
 * 이 함수는 재귀적으로 `statements` 배열을 처리할 수 있습니다.
 * @param {object} block - 단일 엔트리 블록 객체
 * @returns {object} - 변환된 AST 노드
 */
function convertBlockToAstNode(block) {
    const astNode = {
        type: block.type, // 블록 타입 그대로 사용
        arguments: block.param || [], // 'param'을 'arguments'로 변경 (더 일반적인 용어)
        statements: [] // 기본적으로 비어있는 배열로 초기화
    };

    // 'statements'가 존재하고 배열인 경우, 재귀적으로 처리합니다.
    if (block.statements && Array.isArray(block.statements)) {
        for (const stmtBlock of block.statements) {
            // statements 내부의 블록들은 또 다른 블록 스택이 될 수 있습니다.
            // 여기서는 단순화를 위해 각 statement를 하나의 AST 노드로 변환합니다.
            // 실제 구현에서는 statements 배열 안에 여러 블록이 묶여 있을 수 있습니다.
            if (Array.isArray(stmtBlock)) { // statements가 중첩된 배열인 경우 (예: 반복문 내부)
                const nestedStatements = [];
                for (const nestedBlock of stmtBlock) {
                    if (nestedBlock && typeof nestedBlock.type === 'string') {
                        nestedStatements.push(convertBlockToAstNode(nestedBlock));
                    }
                }
                // 중첩된 statement를 위한 별도 AST 노드 타입이 필요할 수 있습니다.
                // 여기서는 임시로 Array로 감싸서 처리합니다.
                astNode.statements.push(nestedStatements); 
            } else if (stmtBlock && typeof stmtBlock.type === 'string') {
                astNode.statements.push(convertBlockToAstNode(stmtBlock));
            }
        }
    }
    return astNode;
}

/**
 * AST를 기반으로 최종 코드를 생성하는 함수 (향후 구현)
 * @param {object} ast - buildAstFromScript로 생성된 AST
 * @returns {string} - 변환된 JavaScript 코드
 */
function codeGen(ast) {
    // TODO: AST를 순회하며 실제 JavaScript 코드를 생성하는 로직 구현
    let generatedCode = '';

    // HEADER를 추가합니다.
    generatedCode += HEADER;

    if (ast && ast.type === "Program" && Array.isArray(ast.body)) {
        ast.body.forEach(node => {
            if (node.type === "EventHandler") {
                // 'when_click_start'에 대한 처리
                if (node.eventName === "run_button_click") {
                    generatedCode += `document.addEventListener('start', () => {\n`;
                    // 핸들러 본문(handlerBody)의 AST 노드를 JavaScript 코드로 변환
                    node.handlerBody.forEach(blockNode => {
                        generatedCode += `    // ${blockNode.type} 블록에 대한 코드\n`;
                        // TODO: 실제 블록 타입에 따른 코드 생성 로직 추가
                        // 예: if (blockNode.type === "move_direction") { generatedCode += `    move(${blockNode.arguments[0]});\n`; }
                    });
                    generatedCode += `});\n\n`;
                }
                // 다른 이벤트 핸들러에 대한 처리 (향후 추가)
                else {
                    generatedCode += `// TODO: '${node.eventName}' 이벤트 핸들러 구현\n\n`;
                }
            }
            // TODO: 다른 최상위 AST 노드 타입에 대한 처리 (예: 함수 정의 등)
        });
    }

    return generatedCode;
}

// 테스트용 함수는 이제 buildAstFromScript를 호출하고 codeGen을 통해 결과를 반환합니다.
function test_ast(entryScript) {
    const ast = buildAstFromScript(entryScript);
    return ast;
}

export { codeGen, test_ast };
