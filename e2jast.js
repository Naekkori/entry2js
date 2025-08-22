import fs from "fs";
import { v4 as uuidv4 } from 'uuid';

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
This is code that works in FastEntry
*/
`;

// Helper to create a valid JS identifier from Entry IDs
function toJsId(id) {
    if (!id) return `invalid_id_${uuidv4().replace(/-/g, '')}`;
    return `var_${id.replace(/[^\w]/g, '_')}`;
}

// Helper to get parameter name from its definition block
function getParamName(paramBlock) {
    // Parameters are identified by their unique block type, which is a hash.
    // e.g., function_param_string_abc123
    return toJsId(paramBlock.type);
}


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

    if (!entryScript) {
        return programAst;
    }

    const scriptData = JSON.parse(entryScript);

    if (Array.isArray(scriptData)) {
        try {
            const scriptData = JSON.parse(entryScript);

            if (!Array.isArray(scriptData)) return programAst;

            for (const blockStack of scriptData) { // 바깥쪽 배열 순회 (블록 묶음)
            const firstBlock = blockStack[0];

            if (!firstBlock || typeof firstBlock.type !== 'string') {
                continue; // 유효하지 않은 블록 스택은 건너뜁니다.
            }

            const isStartBlock = firstBlock.type.startsWith('when_') || firstBlock.type.startsWith('message_cast_');
            const isFunctionDefinition = firstBlock.type === 'function_create' || firstBlock.type === 'function_create_value';




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
                // 함수 정의 블록 처리
                if (isFunctionDefinition) {
                    const funcId = firstBlock.id;
                    const params = [];
                    let currentParamBlock = firstBlock.params[0]?.value; // function_field_label

                    // 파라미터 체인 순회 (function_field_label -> function_field_string -> ...)
                    while (currentParamBlock && currentParamBlock.params && currentParamBlock.params[1] && currentParamBlock.params[1].value) {
                        currentParamBlock = currentParamBlock.params[1].value; // 다음 파라미터 블록으로 이동
                        if (currentParamBlock.type.startsWith('function_field_')) {
                             // 파라미터 블록의 고유 타입(ID)을 이름으로 사용
                            params.push(getParamName(currentParamBlock.params[0].value));
                        }
                    }

                    const funcBody = [];
                    const statements = firstBlock.statements?.[0] || [];
                    for (const block of statements) {
                        if (block && typeof block.type === 'string') {
                            funcBody.push(convertBlockToAstNode(block));
                        }
                    }

                    // 함수 정의 노드를 AST에 추가
                    programAst.body.push({
                        type: "FunctionDefinition",
                        id: funcId,
                        is_value_returning: firstBlock.type === 'function_create_value',
                        params: params,
                        body: funcBody,
                        // 로컬 변수 선언을 위해 함수 본문을 미리 스캔
                        localVariables: findLocalVariables(funcBody)
                    });
                }
            }
        }
        } catch (e) {
            console.error("Failed to parse entry script JSON:", e);
            // 파싱 실패 시 빈 Program 노드 반환
        }
    }
    return programAst;
}

function findLocalVariables(body) {
    const localVars = new Set();
    function traverse(nodes) {
        if (!nodes) return;
        for (const node of nodes) {
            if (node.type === 'set_func_variable' || node.type === 'get_func_variable') {
                // The variable ID is the first argument
                if (node.arguments && node.arguments[0]) {
                    localVars.add(toJsId(node.arguments[0]));
                }
            }
            if (node.statements) node.statements.forEach(traverse);
        }
    }
    traverse(body);
    return Array.from(localVars);
}
/**
 * 단일 엔트리 블록 객체를 해당 AST 노드로 변환합니다.
 * 이 함수는 재귀적으로 `statements` 배열을 처리할 수 있습니다.
 * @param {object} block - 단일 엔트리 블록 객체
 * @returns {object} - 변환된 AST 노드
 */
function convertBlockToAstNode(block) {
    // Copy funcId if it exists (for function call blocks). It's often in block.data.
    const funcId = block.funcId || (block.data ? block.data.funcId : undefined);
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

    if (funcId) {
        astNode.funcId = funcId;
    }

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
    // 함수를 먼저 정의합니다.
    if (ast && ast.type === "Program" && Array.isArray(ast.body)) {
        ast.body.forEach(node => {
            if (node.type === "FunctionDefinition") {
                const funcName = `func_${node.id}`;
                const params = node.params.join(', ');
                generatedCode += `async function ${funcName}(${params}) {\n`;
                // 로컬 변수 선언
                if (node.localVariables.length > 0) {
                    generatedCode += `    let ${node.localVariables.join(', ')};\n`;
                }
                node.body.forEach(blockNode => {
                    generatedCode += generateStatement(blockNode, 4);
                });
                generatedCode += `}\n\n`;
            }
        });
    }
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
            // FunctionDefinition은 이미 위에서 처리했으므로 여기서는 건너뜁니다.
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

const statementGenerators = {
    'move_direction': (node, indent) => {
        const distance = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.moveDirection(${distance});\n`;
    },
    'message_cast': (node, indent) => {
        if (node.arguments[0] === null || typeof node.arguments[0] === 'undefined') {
            return `${' '.repeat(indent)}// INFO: 'message_cast' statement with a null message ID was skipped.\n`;
        }
        const messageId = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.messageCast(${messageId});\n`;
    },
    'move_x': (node, indent) => {
        const x = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setX(Entry.getX() + ${x});\n`;
    },
    'move_y': (node, indent) => {
        const y = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setY(Entry.getY() + ${y});\n`;
    },
    'sound_start_sound': (node, indent) => {
        const soundId = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.playSound(${soundId});\n`;
    },
    '_if': (node, indent) => {
        const condition = generateExpression(node.arguments[0]);
        let code = `${' '.repeat(indent)}if (${condition}) {\n`;
        node.statements[0]?.forEach(stmt => {
            code += generateStatement(stmt, indent + 4);
        });
        code += `${' '.repeat(indent)}}\n`;
        return code;
    },
    'if_else': (node, indent) => {
        const condition = generateExpression(node.arguments[0]);
        let code = `${' '.repeat(indent)}if (${condition}) {\n`;
        node.statements[0]?.forEach(stmt => {
            code += generateStatement(stmt, indent + 4);
        });
        code += `${' '.repeat(indent)}} else {\n`;
        node.statements[1]?.forEach(stmt => {
            code += generateStatement(stmt, indent + 4);
        });
        code += `${' '.repeat(indent)}}\n`;
        return code;
    },
    'repeat_inf': (node, indent) => {
        let code = `${' '.repeat(indent)}while (true) {\n`;
        node.statements[0]?.forEach(stmt => {
            code += generateStatement(stmt, indent + 4);
        });
        code += `${' '.repeat(indent)}}\n`;
        return code;
    },
    'repeat_basic': (node, indent) => {
        const count = generateExpression(node.arguments[0]);
        let code = `${' '.repeat(indent)}for (let i = 0; i < ${count}; i++) {\n`;
        node.statements[0]?.forEach(stmt => {
            code += generateStatement(stmt, indent + 4);
        });
        code += `${' '.repeat(indent)}}\n`;
        return code;
    },
    'stop_repeat': (node, indent) => {
        return `${' '.repeat(indent)}break;\n`;
    },
    'set_func_variable': (node, indent) => {
        const varName = toJsId(node.arguments[0]);
        const value = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}${varName} = ${value};\n`;
    },
    'function_general': (node, indent) => {
        const funcName = `func_${node.funcId}`;
        const args = node.arguments.map(arg => generateExpression(arg)).join(', ');
        return `${' '.repeat(indent)}await ${funcName}(${args});\n`;
    }
};

function generateStatement(node, indent = 0) {
    const generator = statementGenerators[node.type];
    return generator ? generator(node, indent) : `${' '.repeat(indent)}// TODO: Statement for '${node.type}' is not implemented.\n`;
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

        // Function-related expressions
        case 'get_func_variable': {
            return toJsId(arg.arguments[0]);
        }
        case 'function_value': {
            const funcName = `func_${arg.funcId}`;
            const args = arg.arguments.map(a => generateExpression(a)).join(', ');
            return `await ${funcName}(${args})`;
        }
        case 'function_param_string':
        case 'function_param_boolean': {
            // The param name is derived from its unique block type
            return getParamName(arg);
        }

        default: return `/* TODO: Expression for '${arg.type}' */`;
    }
}
function test_ast(entryScript) {
    const ast = buildAstFromScript(entryScript);
    return ast;
}

export { codeGen, test_ast };
