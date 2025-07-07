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
                    // 시작 블록의 파라미터(예: 메시지 ID)를 arguments 속성으로 복사합니다.
                    // convertBlockToAstNode를 사용하여 파라미터 내부의 블록도 재귀적으로 변환합니다.
                    arguments:  (firstBlock.params || []).filter(p => p !== null && typeof p !== 'undefined').map(param =>
                        (typeof param === 'object' && param !== null && param.type)
                            ? convertBlockToAstNode(param)
                            : param
                    ),
                    handlerBody: handlerBody,
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
        // params 배열을 순회하며, 각 파라미터가 블록(객체이며 type 속성을 가짐)이면
        // 재귀적으로 변환하고, 리터럴 값이면 그대로 사용합니다.
        arguments: (block.params || []).filter(p => p !== null && typeof p !== 'undefined').map(param =>
            (typeof param === 'object' && param !== null && param.type)
                ? convertBlockToAstNode(param)
                : param
        ),
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
/**
 * FastEntry 엔진 이벤트 목록
아래는 현재 엔진에서 사용할 수 있는 모든 이벤트의 목록과 설명, 그리고 JavaScript 핸들러로 전달되는 인자 정보입니다.

이벤트 이름 (snake_case)	설명	전달되는 인자
project_start	'시작하기' 버튼을 눌러 프로젝트가 시작될 때 발생합니다.	없음
scene_start	씬이 시작되거나 변경될 때 발생합니다.	없음
object_clicked	오브젝트를 마우스로 눌렀다가 같은 오브젝트 위에서 뗄 때 발생합니다.	objectId (string): 클릭된 오브젝트의 ID
object_click_canceled	오브젝트를 누른 상태에서 포인터가 오브젝트 밖으로 나갔을 때 발생합니다.	없음
key_pressed	키보드의 키를 눌렀을 때 발생합니다.	keyName (string): 눌린 키의 이름 (예: "a", "enter", "space")
key_released	키보드의 키에서 손을 뗐을 때 발생합니다.	keyName (string): 떼어진 키의 이름
mouse_down	마우스 버튼을 눌렀을 때 발생합니다. (오브젝트 위가 아니어도 발생)	없음
mouse_up	마우스 버튼에서 손을 뗐을 때 발생합니다. (오브젝트 위가 아니어도 발생)	없음
message_received	Entry.messageCast("메시지ID") 함수로 신호를 받았을 때 발생합니다.	messageId (string): 수신된 메시지의 ID
clone_created	오브젝트가 복제되었을 때, 복제된 오브젝트 자신에게만 발생합니다.	없음
 */
    if (ast && ast.type === "Program" && Array.isArray(ast.body)) {
        ast.body.forEach(node => {
            if (node.type === "EventHandler") {
                // 'when_click_start'에 대한 처리
                switch (node.eventName) {
                    case "run_button_click":
                        generatedCode += `Entry.on('project_start', () => {\n`;
                        // 핸들러 본문(handlerBody)의 AST 노드를 JavaScript 코드로 변환
                        node.handlerBody.forEach(blockNode => {
                            // 각 최상위 블록을 Statement로 변환하고, 들여쓰기(4)를 적용합니다.
                            generatedCode += generateStatement(blockNode, 4);
                        });
                        generatedCode += `});\n\n`;
                        break;
                    case "mouse_click":
                        generatedCode += `Entry.on('mouse_down', () => {\n`;
                        node.handlerBody.forEach(blockNode => {
                            generatedCode += generateStatement(blockNode, 4);
                        });
                        generatedCode += `});\n\n`;
                        break;
                    case "mouse_click_cancel":
                        generatedCode += `Entry.on('mouse_up', () => {\n`;
                        node.handlerBody.forEach(blockNode => {
                            generatedCode += generateStatement(blockNode, 4);
                        });
                        generatedCode += `});\n\n`;
                        break;
                    case "object_click":
                        generatedCode += `Entry.on('object_click', (objectId) => {\n`;
                        generatedCode += `  if(objectId === Entry.getId()){\n`
                        node.handlerBody.forEach(blockNode => {
                            generatedCode += generateStatement(blockNode, 4);
                        });
                        generatedCode += `  }\n`;
                        generatedCode += `});\n\n`;
                        break;
                    case "object_click_canceled":
                        generatedCode += `Entry.on('object_click_canceled', () => {\n`;
                        // 이 이벤트는 특정 오브젝트에 국한되지 않으므로 if문 없이 모든 블록을 실행합니다.
                        node.handlerBody.forEach(blockNode => {
                            generatedCode += generateStatement(blockNode, 4);
                        });
                        generatedCode += `});\n\n`;
                        break; // Fall-through 버그 수정
                    case "message_cast":
                        // 메시지 ID가 null이면 이벤트 핸들러를 생성하지 않습니다.
                        if (node.arguments[0] === null || typeof node.arguments[0] === 'undefined') {
                            generatedCode += `// INFO: 'when_message_cast' block with a null message ID was skipped.\n\n`;
                            break;
                        }
                        generatedCode += `Entry.on('message_received', (messageId) => {\n`;
                        generatedCode += `  if (messageId === ${generateExpression(node.arguments[0])}) {\n`;
                        node.handlerBody.forEach(blockNode => {
                            // if문 내부는 들여쓰기 4칸으로 생성합니다.
                            generatedCode += generateStatement(blockNode, 4);
                        });
                        generatedCode += `  }\n`; // if 문의 닫는 괄호를 루프 밖으로 이동하고 올바르게 들여쓰기합니다.
                        generatedCode += `});\n\n`;
                        break;
                    case "scene_start":
                        generatedCode += `Entry.on('scene_start', () => {\n`;
                        node.handlerBody.forEach(blockNode => {
                            generatedCode += generateStatement(blockNode, 4);
                        });
                        generatedCode += `});\n\n`;
                        break;
                    case "clone_created":
                        generatedCode += `Entry.on('clone_created', () => {\n`;
                        node.handlerBody.forEach(blockNode=> {
                            generatedCode += generateStatement(blockNode, 4);
                        });
                        generatedCode += `});\n\n`;
                        break;
                    default:
                        generatedCode += `// TODO: '${node.eventName}' 이벤트 핸들러 구현\n\n`;
                        break;
                }
            }
            // TODO: 다른 최상위 AST 노드 타입에 대한 처리 (예: 함수 정의 등)
        });
    }

    return generatedCode;
}

/**
 * 엔트리의 연산자 문자열을 JavaScript 연산자로 변환합니다.
 * @param {string} op - 엔트리 연산자 (예: "PLUS", "MINUS", "EQUAL")
 * @returns {string} JavaScript 연산자 (예: "+", "-", "===")
 */
function mapOperator(op) {
    const opMap = {
        PLUS: '+', MINUS: '-', TIMES: '*', DIVIDE: '/',
        EQUAL: '===', GREATER: '>', LESS: '<',
        // TODO: 논리 연산자 추가
        // AND: '&&', OR: '||'
    };
    return opMap[op] || op; // 맵에 없으면 원본 반환
}


/**
 * AST 노드를 기반으로 하나의 JavaScript 구문(Statement)을 생성합니다.
 * @param {object} node - 변환할 AST 노드
 * @param {number} indent - 들여쓰기 레벨 (스페이스 수)
 * @returns {string} 생성된 JavaScript 코드 라인
 */
function generateStatement(node, indent = 0) {
    const prefix = ' '.repeat(indent);

    // C++에 바인딩된 함수 이름과 엔트리 블록 타입을 매핑합니다.
    switch (node.type) {
        case 'move_direction': {
            const distance = generateExpression(node.arguments[0]);
            return `${prefix}Entry.moveDirection(${distance});\n`;
        }

        case 'message_cast': {
            // 메시지 ID가 null이면 구문을 생성하지 않습니다.
            if (node.arguments[0] === null || typeof node.arguments[0] === 'undefined') {
                return `${prefix}// INFO: 'message_cast' statement with a null message ID was skipped.\n`;
            }
            const messageId = generateExpression(node.arguments[0]);
            // C++에 바인딩된 함수 이름(messageCast)과 일치시킵니다.
            return `${prefix}Entry.messageCast(${messageId});\n`;
        }

        case 'move_y': {
            const y = generateExpression(node.arguments[0]);
            return `${prefix}Entry.setY(Entry.getY() + ${y}); // move_y는 setY와 getY 조합으로 구현\n`;
        }

        case 'sound_start_sound': {
            const soundId = generateExpression(node.arguments[0]);
            return `${prefix}Entry.playSound(${soundId});\n`;
        }

        case '_if': {
            const condition = generateExpression(node.arguments[0]);
            let code = `${prefix}if ${condition} {\n`;
            if (node.statements[0] && Array.isArray(node.statements[0])) {
                node.statements[0].forEach(stmt => {
                    code += generateStatement(stmt, indent + 4);
                });
            }
            code += `${prefix}}\n`;
            return code;
        }

        case 'if_else': { // if-else 블록
            const condition = generateExpression(node.arguments[0]);
            let code = `${prefix}if ${condition} {\n`;
            node.statements[0]?.forEach(stmt => { // if 본문
                code += generateStatement(stmt, indent + 4);
            });
            code += `${prefix}} else {\n`;
            node.statements[1]?.forEach(stmt => { // else 본문
                code += generateStatement(stmt, indent + 4);
            });
            code += `${prefix}}\n`;
            return code;
        }

        case 'repeat_inf': {
            let code = `${prefix}while (true) {\n`;
            node.statements[0]?.forEach(stmt => {
                code += generateStatement(stmt, indent + 4);
            });
            code += `${prefix}}\n`;
            return code;
        }

        case 'repeat_basic': {
            const count = generateExpression(node.arguments[0]);
            let code = `${prefix}for (let i = 0; i < ${count}; i++) {\n`;
            node.statements[0]?.forEach(stmt => { // 반복 본문
                code += generateStatement(stmt, indent + 4);
            });
            code += `${prefix}}\n`;
            return code;
        }

        case 'stop_repeat': { // '반복 중단하기' 블록
            return `${prefix}break;\n`;
        }

        default:
            return `${prefix}// TODO: Statement for '${node.type}' is not implemented.\n`;
    }
}

/**
 * AST 노드 또는 리터럴 값을 JavaScript 표현식(Expression)으로 변환합니다.
 * @param {object|string|number} arg - 변환할 인자 (AST 노드 또는 리터럴)
 * @returns {string} 생성된 JavaScript 표현식
 */
function generateExpression(arg) {
    // 인자가 블록(객체)이 아닌 리터럴 값일 경우
    if (typeof arg !== 'object' || arg === null) {
        // 값의 타입에 따라 처리: 문자열은 따옴표로 감싸고, 숫자는 그대로 둡니다.
        if (typeof arg === 'string') {
            return JSON.stringify(arg);
        }
        return String(arg);
    }

    // 인자가 값을 반환하는 블록일 경우
    switch (arg.type) {
        case 'text': return JSON.stringify(arg.arguments[0] || '');
        case 'number': return String(arg.arguments[0] || 0);
        // 엔트리의 '참/거짓' 블록은 True/False 타입을 가집니다.
        case 'True': return 'true';
        case 'False': return 'false';

        // 계산 블록 처리
        case 'calc_basic': {
            const left = generateExpression(arg.arguments[0]);
            const op = mapOperator(arg.arguments[1]);
            const right = generateExpression(arg.arguments[2]);
            return `(${left} ${op} ${right})`;
        }

        // 판단 블록의 조건 부분 처리
        case 'boolean_basic_operator': {
            const left = generateExpression(arg.arguments[0]);
            const op = mapOperator(arg.arguments[1]);
            const right = generateExpression(arg.arguments[2]);
            return `(${left} ${op} ${right})`;
        }

        // 좌표/크기 등 오브젝트의 속성값 블록 처리
        case 'coordinate_object': {
            // arg.arguments 예시: ["self","y"]
            const target = arg.arguments[0];
            const prop = arg.arguments[1];
            if (target === 'self') { // '자신'의 속성값
                if (prop === 'x') return `Entry.getX()`;
                if (prop === 'y') return `Entry.getY()`;
                if (prop === 'rotation') return `Entry.getRotation()`;
                if (prop === 'scale') return `Entry.getScale()`;
                if (prop === 'direction') return `Entry.getDirection()`;
                if (prop === 'size') return `Entry.getSize()`;
                // TODO: size, direction 등 다른 속성 추가
            }
            return `/* TODO: coordinate_object for ${target}.${prop} */`;
        }

        default: return `/* TODO: Expression for '${arg.type}' */`;
    }
}
function test_ast(entryScript) {
    const ast = buildAstFromScript(entryScript);
    return ast;
}

export { codeGen, test_ast };
