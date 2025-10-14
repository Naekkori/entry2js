import fs from "fs";
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, 'package.json');

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
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
    return `var_${id.replace(/[\][\W]/g, '_')}`;
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
function buildAstFromScript(entryScript, functionId = undefined, objectId = undefined) {
    // 최상위 Program 노드를 생성합니다.
    const programAst = {
        type: "Program",
        body: [] // 프로그램 본문, 이벤트 핸들러 및 기타 최상위 구문 포함
    };

    if (!entryScript) {
        return programAst;
    }

    let scriptData;
    try {
        scriptData = JSON.parse(entryScript);
    } catch (e) {
        console.error("Failed to parse entry script JSON:", e);
        return programAst; // 파싱 실패 시 빈 Program 노드 반환
    }

    if (!Array.isArray(scriptData)) {
        return programAst;
    }

    try {
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
                            // statements는 재귀적으로 처리될 수 있도록 구조를 유지합니다. (objectId 추가)
                            handlerBody.push(convertBlockToAstNode(block, objectId));
                        }
                    }
                }

                programAst.body.push({
                    type: "EventHandler",
                    eventName: eventName,
                    // 시작 블록의 파라미터(예: 메시지 ID)를 arguments 속성으로 복사합니다.
                    // convertBlockToAstNode를 사용하여 파라미터 내부의 블록도 재귀적으로 변환합니다.
                    arguments: (firstBlock.params || []).filter(p => p !== null && typeof p !== 'undefined').map(param =>
                        (typeof param === 'object' && param !== null && param.type) // (objectId 추가)
                            ? convertBlockToAstNode(param, objectId)
                            : param
                    ),
                    handlerBody: handlerBody,
                });
            } else {
                // 함수 정의 블록 처리
                if (isFunctionDefinition) {
                    // project.json의 함수 ID가 있으면 사용하고, 없으면 스크립트 내의 ID를 사용합니다.
                    // 스크립트 내의 ID는 'l0uw'와 같은 형태일 수 있습니다.
                    const funcId = functionId || firstBlock.id;
                    const params = [];

                    // 함수 정의 블록의 파라미터를 재귀적으로 탐색하는 함수
                    function findParamsRecursive(paramArray) {
                        if (!paramArray || !Array.isArray(paramArray)) return;

                        for (const p of paramArray) {
                            if (!p) continue;

                            // 실제 파라미터 정의 블록 (function_field_string/boolean)을 찾습니다.
                            if (p.type && (p.type.startsWith('function_field_string') || p.type.startsWith('function_field_boolean'))) {
                                const paramBlock = p.params?.[0]; // e.g., { type: 'stringParam_umnz', ... }
                                if (paramBlock && (paramBlock.type.startsWith('stringParam_') || paramBlock.type.startsWith('booleanParam_'))) {
                                    const paramId = paramBlock.type.substring(paramBlock.type.indexOf('_') + 1);
                                    params.push(toJsId(paramId));
                                }
                            }

                            // 중첩된 파라미터 배열을 계속 탐색합니다 (e.g., function_field_label 내부).
                            findParamsRecursive(p.params);
                        }
                    }

                    findParamsRecursive(firstBlock.params);

                    const funcBody = [];
                    const statements = firstBlock.statements?.[0] || [];
                    for (const block of statements) {
                        if (block && typeof block.type === 'string') {
                            funcBody.push(convertBlockToAstNode(block, objectId));
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
        console.error("Failed to process script:", e);
        // 처리 중 에러 발생 시에도 부분적으로 파싱된 AST를 반환할 수 있도록 함
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
 * AST 노드 트리에서 마지막으로 값이 할당된 지역 변수의 이름을 찾습니다.
 * @param {object} node - 검사를 시작할 AST 노드
 * @returns {string|null} 마지막으로 할당된 변수 이름 (toJsId 형식) 또는 null
 */
function findLastAssignedVariable(node) {
    if (!node) return null;

    // 제어문(if, if_else, repeat 등)의 경우, 내부 statements를 재귀적으로 탐색합니다.
    if (node.statements && node.statements.length > 0) {
        // 제어문은 여러 개의 statement 배열을 가질 수 있습니다 (if/else). 뒤에서부터 탐색합니다.
        for (let i = node.statements.length - 1; i >= 0; i--) {
            const innerStatements = node.statements[i];
            if (innerStatements && innerStatements.length > 0) {
                const result = findLastAssignedVariable(innerStatements[innerStatements.length - 1]);
                if (result) return result;
            }
        }
    }

    if (node.type === 'set_func_variable' && node.arguments && node.arguments[0]) {
        return toJsId(node.arguments[0]);
    }

    return null;
}
/**
 * 단일 엔트리 블록 객체를 해당 AST 노드로 변환합니다.
 * 이 함수는 재귀적으로 `statements` 배열을 처리할 수 있습니다.
 * @param {object} block - 단일 엔트리 블록 객체
 * @returns {object} - 변환된 AST 노드
 */
function convertBlockToAstNode(block, objectId) {
    let funcId = undefined;
    // 함수 호출 블록(예: 'func_epqt')에서 funcId를 추출합니다.
    if (block.type.startsWith('func_')) {
        funcId = block.type.substring(5);
    }
    let paramId = null;
    if (block.type.startsWith('function_param_string') || block.type.startsWith('function_param_boolean')) {
        if (block.params?.[0]) {
            paramId = block.params[0];
        }
    } else if (block.type.startsWith('stringParam_') || block.type.startsWith('booleanParam_')) {
        // 함수 본문 내에서 사용되는 파라미터 블록 (e.g., 'stringParam_umnz')
        // 타입 자체에서 ID를 추출합니다.
        paramId = block.type.substring(block.type.indexOf('_') + 1);
    }

    const astNode = {
        // 함수 파라미터 블록의 경우, arguments[0]에 ID가 들어있습니다.
        // 이를 paramId로 추출하여 AST 노드에 명시적으로 추가합니다.
        ...(paramId ? { paramId: paramId } : {}),
        objectId: objectId, // 오브젝트 ID를 노드에 추가
        type: block.type, // 블록 타입 그대로 사용
        // params 배열을 순회하며, 각 파라미터가 블록(객체이며 type 속성을 가짐)이면
        // 재귀적으로 변환하고, 리터럴 값이면 그대로 사용합니다.
        arguments: (block.params || []).filter(p => p !== null && typeof p !== 'undefined').map(param =>
            (typeof param === 'object' && param !== null && param.type)
                ? convertBlockToAstNode(param, objectId)
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
                        nestedStatements.push(convertBlockToAstNode(nestedBlock, objectId));
                    }
                }
                // 중첩된 statement를 위한 별도 AST 노드 타입이 필요할 수 있습니다.
                // 여기서는 임시로 Array로 감싸서 처리합니다.
                astNode.statements.push(nestedStatements);
            } else if (stmtBlock && typeof stmtBlock.type === 'string') {
                astNode.statements.push(convertBlockToAstNode(stmtBlock, objectId));
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
function codeGen(ast, objectId) {
    // TODO: AST를 순회하며 실제 JavaScript 코드를 생성하는 로직 구현
    let generatedCode = '';

    // HEADER를 추가합니다.
    generatedCode += HEADER + '\n';
    if (objectId) {
        generatedCode += `let fe_b_thic_${toJsId(objectId).substring(4)} = 0.1;\n`;
    }
    //generatedCode += `Entry.lambda = Entry.lambda || {};\n\n`; 이코드는 엔진에서 자동으로 할당합니다.

    // 함수를 먼저 정의합니다.
    if (ast && ast.type === "Program" && Array.isArray(ast.body)) {
        ast.body.forEach(node => {
            if (node.type === "FunctionDefinition") {
                const funcName = `func_${node.id}`;
                const params = node.params.join(', ');
                generatedCode += `Entry.lambda.${funcName} = async function(${params}) {
`;
                // 로컬 변수 선언
                if (node.localVariables.length > 0) {
                    generatedCode += `    let ${node.localVariables.join(', ')};
`;
                }

                let functionBodyCode = '';
                node.body.forEach(blockNode => {
                    functionBodyCode += generateStatement(blockNode, 4, { objectId });
                });

                generatedCode += functionBodyCode;

                // 값 반환 함수이고, 생성된 본문에 return 문이 없는 경우 암시적 반환을 처리합니다.
                if (node.is_value_returning && !functionBodyCode.includes('return ')) {
                    const lastNode = node.body.length > 0 ? node.body[node.body.length - 1] : null;
                    if (lastNode) {
                        const isLastNodeStatement = !!statementGenerators[lastNode.type];

                        if (isLastNodeStatement) {
                            // 마지막 노드가 구문(if, if_else 등)이면, 그 안에서 마지막으로 할당된 변수를 찾아서 반환합니다.
                            const varToReturn = findLastAssignedVariable(lastNode);
                            if (varToReturn) {
                                generatedCode += `    return ${varToReturn};\n`;
                            }
                        } else {
                            // 마지막 노드가 표현식이면, 그 표현식의 결과를 반환합니다.
                            generatedCode += `    return ${generateExpression(lastNode, { objectId })};\n`;
                        }
                    }
                }

                generatedCode += `};

`;
            }
        });
    }
    if (ast && ast.type === "Program" && Array.isArray(ast.body)) {
        ast.body.forEach(node => {
            if (node.type === "EventHandler") {
                const config = eventHandlerConfig[node.eventName];
                if (config) {
                    generatedCode += generateEventHandler(node, config, objectId);
                } else {
                    generatedCode += `// TODO: '${node.eventName}' 이벤트 핸들러 구현

`;
                }
            }
            // FunctionDefinition은 이미 위에서 처리했으므로 여기서는 건너뜁니다.
        });
    }

    return generatedCode;
}

const eventHandlerConfig = {
    "run_button_click": { event: 'project_start' },
    "mouse_click": { event: 'mouse_down' },
    "mouse_click_cancel": { event: 'mouse_up' },
    "object_click": {
        event: 'object_click',
    },
    "object_click_canceled": { event: 'object_click_canceled' },
    "message_cast": {
        event: 'message_received',
        param: 'messageId',
        conditionBuilder: (args) => {
            if (args[0] === null || typeof args[0] === 'undefined') return null;
            return `messageId === ${generateExpression(args[0])}`;
        },
        indent: 2
    },
    "scene_start": { event: 'scene_start' },
    "clone_created": { event: 'clone_created' },
    "clone_start": { event: 'clone_start' },
    "some_key_pressed": { event: 'key_pressed', param: 'key' },
};
function generateEventHandler(node, config, objectId) {
    let code = '';
    const param = config.param || '';
    let condition = config.condition;

    if (config.conditionBuilder) {
        condition = config.conditionBuilder(node.arguments);
        if (condition === null) {
            return `// INFO: 'when_${node.eventName}' block with invalid arguments was skipped.\n`;
        }
    }

    let currentIndent = 0;
    code += `Entry.on('${config.event}', async (${param}) => {\n`;
    currentIndent += 2; // Indent for the event handler body

    if (condition) {
        code += `${' '.repeat(currentIndent)}if (${condition}) {\n`;
        currentIndent += 2; // Indent for the condition block
    }

    const bodyIndent = currentIndent + (config.indent || 0);
    node.handlerBody.forEach(blockNode => {
        code += generateStatement(blockNode, bodyIndent, { objectId });
    });

    if (condition) {
        currentIndent -= 2; // De-indent for the condition block
        code += `${' '.repeat(currentIndent)}}\n`;
    }

    code += `});\n`;
    return code;
}
/**
 * AST 노드 배열을 재귀적으로 탐색하여 'await'를 유발하는 블록이 있는지 확인합니다.
 * @param {object[]} nodes - 검사할 AST 노드의 배열
 * @returns {boolean} 'await'를 유발하는 블록이 있으면 true, 그렇지 않으면 false
 */
function containsAwait(nodes) {
    if (!nodes || !Array.isArray(nodes)) {
        return false;
    }

    // 'await'를 생성하는 블록 타입 목록
    const awaitableTypes = [
        'wait_second', 'wait_until_true', 'ask_and_wait',
        'locate_object_time', 'move_xy_time', 'locate_xy_time',
        'rotate_by_time', 'direction_relative_duration',
        'sound_something_wait_with_block', 'sound_something_second_wait_with_block',
        'sound_from_to_and_wait', 'function_value'
    ];

    for (const node of nodes) {
        if (!node) continue;

        // 현재 노드가 awaitable 타입이거나 함수 호출 블록인 경우
        if (awaitableTypes.includes(node.type) || node.type.startsWith('func_')) {
            return true;
        }

        // 중첩된 statements 배열이 있다면 재귀적으로 탐색
        if (node.statements && node.statements.some(stmtList => containsAwait(stmtList))) {
            return true;
        }
    }
    return false;
}
/**
 * 엔트리의 연산자 문자열을 JavaScript 연산자로 변환합니다.
 * @param {string} op - 엔트리 연산자 (예: "PLUS", "MINUS", "EQUAL")
 * @returns {string} JavaScript 연산자 (예: "+", "-", "===")
 */
function mapOperator(op) {
    const opMap = {
        PLUS: '+', MINUS: '-', MULTI: '*', DIVIDE: '/', MOD: '%', DIV: '/', MODULO: '%',
        EQUAL: '===', GREATER: '>', LESS: '<', AND: '&&', OR: '||', NOT: '!',
        NOT_EQUAL: '!==', GREATER_OR_EQUAL: '>=', LESS_OR_EQUAL: '<=',
    };
    return opMap[op] || op; // 맵에 없으면 원본 반환
}


/**
 * AST 노드를 기반으로 하나의 JavaScript 구문(Statement)을 생성합니다.
 * @param {object} node - 변환할 AST 노드
 * @param {number} indent - 들여쓰기 레벨 (스페이스 수)
 * @returns {string} 생성된 JavaScript 코드 라인
 */

/**
 * statementGenerator를 안전하게 생성하는 고차 함수입니다.
 * 이 함수는 생성기에 전달될 표현식(argument)들을 미리 평가합니다.
 * 만약 표현식 중 하나라도 미구현되어 `null`을 반환하면,
 * 해당 구문 전체를 주석 처리하고 경고 메시지를 반환합니다.
 * 모든 표현식이 유효할 경우에만 실제 생성기 함수를 호출합니다.
 *
 * @param {number[]} argIndices - 평가할 node.arguments의 인덱스 배열
 * @param {function(object, number, object, string[]): string} generator - (node, indent, context, expressions)를 인자로 받아 코드 문자열을 반환하는 함수
 * @returns {function(object, number, object): string} - 최종 statementGenerator 함수
 */
function createSafeStatementGenerator(argIndices, generator) {
    return (node, indent, context) => {
        const results = argIndices.map(i => generateExpression(node.arguments[i], context));
        const firstError = results.find(res => res && res.error);

        if (firstError) {
            // 실패한 표현식의 타입을 주석에 포함시킵니다.
            return `${' '.repeat(indent)}// INFO: Statement for '${node.type}' was skipped because expression '${firstError.type}' is not implemented.\n`;
        }

        // 모든 표현식이 성공적으로 변환되었으면 실제 생성기를 호출합니다.
        return generator(node, indent, context, results);
    };
}

const statementGenerators = {
    'move_direction': createSafeStatementGenerator([0], (node, indent, context, [distance]) =>
        `${' '.repeat(indent)}Entry.moveDirection(${distance});\n`
    ),
    'message_cast': createSafeStatementGenerator([0], (node, indent, context, [messageIdExpr]) =>
        `${' '.repeat(indent)}Entry.messageCast(${messageIdExpr});\n`
    ),
    'move_x': createSafeStatementGenerator([0], (node, indent, context, [x]) =>
        `${' '.repeat(indent)}Entry.setX(Entry.getX() + ${x});\n`
    ),
    'move_y': createSafeStatementGenerator([0], (node, indent, context, [y]) =>
        `${' '.repeat(indent)}Entry.setY(Entry.getY() + ${y});\n`
    ),
    'locate_x': createSafeStatementGenerator([0], (node, indent, context, [x]) =>
        `${' '.repeat(indent)}Entry.setX(${x});\n`
    ),
    'locate_y': createSafeStatementGenerator([0], (node, indent, context, [y]) =>
        `${' '.repeat(indent)}Entry.setY(${y});\n`
    ),
    'locate_xy': createSafeStatementGenerator([0, 1], (node, indent, context, [x, y]) =>
        `${' '.repeat(indent)}Entry.locateXY(${x}, ${y});\n`
    ),
    'move_xy_time': createSafeStatementGenerator([0, 1, 2], (node, indent, context, [time, x, y]) =>
        `${' '.repeat(indent)}await Entry.moveXYtime(Entry.getX() + ${x}, Entry.getY() + ${y}, ${time});\n`
    ),
    'locate_xy_time': createSafeStatementGenerator([0, 1, 2], (node, indent, context, [time, x, y]) =>
        `${' '.repeat(indent)}await Entry.moveXYtime(${x}, ${y}, ${time});\n`
    ),
    'rotate_relative': createSafeStatementGenerator([0], (node, indent, context, [angle]) =>
        `${' '.repeat(indent)}Entry.rotateRelative(${angle});\n`
    ),
    // 'rotate_relative'는 모양의 각도를, 'direction_relative'는 이동 방향을 바꿉니다. (별개 기능)
    'direction_relative': createSafeStatementGenerator([0], (node, indent, context, [angle]) =>
        `${' '.repeat(indent)}Entry.turnRelative(${angle});\n`
    ),
    'rotate_by_time': createSafeStatementGenerator([0, 1], (node, indent, context, [angle, time]) =>
        `${' '.repeat(indent)}await Entry.rotateByTime(${angle}, ${time});\n`
    ),
    // 'rotate_by_time'은 모양의 각도를, 'direction_relative_duration'은 이동 방향을 시간에 따라 바꿉니다. (별개 기능)
    'direction_relative_duration': createSafeStatementGenerator([0, 1], (node, indent, context, [angle, time]) =>
        `${' '.repeat(indent)}await Entry.turnByTime(${angle}, ${time});\n`
    ),
    'direction_absolute': createSafeStatementGenerator([0], (node, indent, context, [angle]) =>
        `${' '.repeat(indent)}Entry.setDirection(${angle});\n`
    ),
    'rotate_absolute': createSafeStatementGenerator([0], (node, indent, context, [angle]) =>
        `${' '.repeat(indent)}Entry.setRotation(${angle});\n`
    ),
    'see_angle_object': createSafeStatementGenerator([0], (node, indent, context, [target]) =>
        `${' '.repeat(indent)}Entry.seeAngleObj(${target});\n`
    ),
    // 'move_direction'은 현재 방향으로, 'move_to_angle'은 지정된 각도로 이동합니다. (별개 기능)
    'move_to_angle': createSafeStatementGenerator([0, 1], (node, indent, context, [angle, distance]) =>
        `${' '.repeat(indent)}Entry.moveToAngle(${angle}, ${distance});\n`
    ),
    'sound_something_with_block': createSafeStatementGenerator([0], (node, indent, context, [soundId]) =>
        `${' '.repeat(indent)}Entry.playSound(${soundId});\n`
    ),
    'sound_something_second_with_block': createSafeStatementGenerator([0, 1], (node, indent, context, [soundId, duration]) =>
        `${' '.repeat(indent)}Entry.playSoundForDuration(${soundId}, ${duration});\n`
    ),
    'sound_something_wait_with_block': createSafeStatementGenerator([0], (node, indent, context, [soundId]) =>
        `${' '.repeat(indent)}await Entry.waitforPlaysound(${soundId});\n`
    ),
    'sound_something_second_wait_with_block': createSafeStatementGenerator([0, 1], (node, indent, context, [soundId, duration]) =>
        `${' '.repeat(indent)}await Entry.waitforPlaysoundWithSeconds(${soundId}, ${duration});\n`
    ),
    'sound_from_to_and_wait': createSafeStatementGenerator([0, 1, 2], (node, indent, context, [soundId, from, to]) =>
        `${' '.repeat(indent)}await Entry.waitforPlaysoundFromto(${soundId}, ${from}, ${to});\n`
    ),
    'sound_from_to': createSafeStatementGenerator([0, 1, 2], (node, indent, context, [soundId, from, to]) =>
        `${' '.repeat(indent)}Entry.playSoundFromto(${soundId}, ${from}, ${to});\n`
    ),
    'locate': createSafeStatementGenerator([0], (node, indent, context, [targetObjectID]) =>
        `${' '.repeat(indent)}Entry.locate(${targetObjectID});\n`
    ),
    'bounce_wall': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.bounceWall();\n`;
    },
    'dialog': createSafeStatementGenerator([0, 1], (node, indent, context, [message, option]) =>
        `${' '.repeat(indent)}Entry.dialog(${message}, ${option});\n`
    ),
    'dialog_time': createSafeStatementGenerator([0, 1, 2], (node, indent, context, [message, time, option]) =>
        `${' '.repeat(indent)}Entry.dialog(${message}, ${option}, ${time});\n`
    ),
    'remove_dialog': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.removeDialog();\n`;
    },
    'change_shape': createSafeStatementGenerator([0], (node, indent, context, [shapeId]) =>
        `${' '.repeat(indent)}Entry.changeShape(${shapeId});\n`
    ),
    'change_effect_amount': createSafeStatementGenerator([0, 1], (node, indent, context, [effect, amount]) =>
        `${' '.repeat(indent)}Entry.changeEffectAmount(${effect}, ${amount});\n`
    ),
    'erase_all_effects':(node,indent,context)=>{
        return `${' '.repeat(indent)}Entry.clearEffects();\n`;
    },
    // 왜 그렇게 짰는지 모르겠지만 서로 반대로 작동하도록 설계된듯.
    'flip_x': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.flipY();\n`;
    },
    'flip_y': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.flipX();\n`;
    },
    'show': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.setVisibility(true);\n`;
    },
    'hide': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.setVisibility(false);\n`;
    },
    '_if': createSafeStatementGenerator([0], (node, indent, context, [condition]) => {
        let code = `${' '.repeat(indent)}if (${condition}) {\n`;
        node.statements[0]?.forEach(stmt => {
            code += generateStatement(stmt, indent + 4, context);
        });
        code += `${' '.repeat(indent)}}\n`;
        return code;
    }),
    'if_else': createSafeStatementGenerator([0], (node, indent, context, [condition]) => {
        let code = `${' '.repeat(indent)}if (${condition}) {\n`;
        node.statements[0]?.forEach(stmt => {
            code += generateStatement(stmt, indent + 4, context);
        });
        code += `${' '.repeat(indent)}} else {\n`;
        node.statements[1]?.forEach(stmt => {
            code += generateStatement(stmt, indent + 4, context);
        });
        code += `${' '.repeat(indent)}}\n`;
        return code;
    }),
    'repeat_inf': (node, indent, context) => {
        const statements = node.statements[0] || [];
        const hasAwait = containsAwait(statements);

        let bodyCode = '';
        statements.forEach(stmt => {
            bodyCode += generateStatement(stmt, indent + 4, context);
        });

        let code = `${' '.repeat(indent)}while(true) {\n`;
        code += bodyCode;

        if (!hasAwait) {
            code += `${' '.repeat(indent + 4)}await Entry.deltaTimeDelay();\n`;
        }

        code += `${' '.repeat(indent)}}\n`;
        return code;
    },
    'repeat_basic': createSafeStatementGenerator([0], (node, indent, context, [count]) => {
        const loopLevel = context.loopLevel || 0;
        const loopVar = `fe_loop_${loopLevel}`; // 항상 고유한 이름 생성
        const newContext = { ...context, loopLevel: loopLevel + 1 };

        const statements = node.statements[0] || [];
        const hasAwait = containsAwait(statements);

        let bodyCode = '';
        statements.forEach(stmt => {
            bodyCode += generateStatement(stmt, indent + 4, newContext);
        });
        let code=`${' '.repeat(indent)}for (let ${loopVar} = 0; ${loopVar} < ${count}; ${loopVar}++) {\n`;
        code += bodyCode;

        if (!hasAwait) {
            // 반복문 내부에 await가 없는 경우, 브라우저가 멈추는 것을 방지하기 위해 지연을 추가합니다.
            code += `${' '.repeat(indent + 4)}await Entry.deltaTimeDelay();\n`;
        }

        code += `${' '.repeat(indent)}}\n`;
        return code;
    }),
    'repeat_while_true': createSafeStatementGenerator([0], (node, indent, context, [conditionExpr]) => {
        const option = node.arguments[1]; // 'until' or 'while'
        const finalCondition = option === 'until' ? `!(${conditionExpr})` : conditionExpr;

        const statements = node.statements[0] || [];
        const hasAwait = containsAwait(statements);

        let bodyCode = '';
        statements.forEach(stmt => {
            bodyCode += generateStatement(stmt, indent + 4, context);
        });

        let code = `${' '.repeat(indent)}while (${finalCondition}) {\n`;
        code += bodyCode;

        if (!hasAwait) {
            code += `${' '.repeat(indent + 4)}await Entry.deltaTimeDelay();\n`;
        }

        code += `${' '.repeat(indent)}}\n`;
        return code;
    }),
    'stop_repeat': (node, indent, context) => {
        return `${' '.repeat(indent)}break;\n`;
    },
    'set_func_variable': createSafeStatementGenerator([1], (node, indent, context, [value]) => {
        const varName = toJsId(node.arguments[0]); // ID는 리터럴이므로 직접 가져옵니다.
        return `${' '.repeat(indent)}${varName} = ${value};\n`;
    }),
    'set_return_value': createSafeStatementGenerator([0], (node, indent, context, [value]) => `${' '.repeat(indent)}return ${value};\n`),
    'wait_until_true': createSafeStatementGenerator([0], (node, indent, context, [condition]) => {
        // 조건식에 'await'가 포함되어 있으면 async 함수로 감싸야 합니다.
        const asyncPrefix = condition.includes('await') ? 'async ' : '';
        return `${' '.repeat(indent)}await Entry.waitUntilTrue(${asyncPrefix}() => ${condition});\n`;
    }),
    'function_general': (node, indent, context) => {
        const funcName = `func_${node.funcId}`;
        const args = node.arguments.map(arg => generateExpression(arg, context)).join(', ');
        return `${' '.repeat(indent)}await Entry.lambda.${funcName}(${args});\n`;
    },
    'set_variable': createSafeStatementGenerator([0, 1], (node, indent, context, [varid, value]) =>
        `${' '.repeat(indent)}Entry.variableContainer.setVariable(${varid}, ${value});\n`
    ),
    'change_variable': createSafeStatementGenerator([0, 1], (node, indent, context, [varid, value]) =>
        `${' '.repeat(indent)}Entry.variableContainer.changeVariable(${varid}, ${value});\n`
    ),
    'start_scene': createSafeStatementGenerator([0], (node, indent, context, [sceneId]) =>
        `${' '.repeat(indent)}Entry.startScene(${sceneId});\n`
    ),
    'start_neighbor_scene': createSafeStatementGenerator([0], (node, indent, context, [sceneId]) =>
        `${' '.repeat(indent)}Entry.startNeighborScene(${sceneId});\n`
    ),
    'create_clone': createSafeStatementGenerator([0], (node, indent, context, [targetObjectID]) =>
        `${' '.repeat(indent)}Entry.createClone(${targetObjectID});\n`
    ),
    'delete_clone': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.deleteClone();\n`;
    },
    'stop_object': createSafeStatementGenerator([0], (node, indent, context, [targetOption]) =>
        `${' '.repeat(indent)}Entry.stopObject(${targetOption});\n`
    ),
    'choose_project_timer_action': createSafeStatementGenerator([0], (node, indent, context, [action]) =>
        `${' '.repeat(indent)}Entry.setTimerAction(${action});\n`
    ),
    'set_visible_project_timer': createSafeStatementGenerator([0], (node, indent, context, [visible]) =>
        `${' '.repeat(indent)}Entry.setVisibleTimer(${visible});\n`
    ),
    'locate_object_time': createSafeStatementGenerator([0, 1], (node, indent, context, [id, time]) =>
        `${' '.repeat(indent)}await Entry.locateObjectTime(${id}, ${time});\n`
    ),
    'change_to_next_shape': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.changeShapeNext("next");\n`;
    },
    'change_to_some_shape': createSafeStatementGenerator([0], (node, indent, context, [shapeId]) =>
        `${' '.repeat(indent)}Entry.changeShape(${shapeId});\n`
    ),
    'add_effect_amount': createSafeStatementGenerator([0, 1], (node, indent, context, [effect, amount]) =>
        `${' '.repeat(indent)}Entry.addEffectAmount(${effect}, ${amount});\n`
    ),
    'change_scale_size': createSafeStatementGenerator([0], (node, indent, context, [size]) =>
        `${' '.repeat(indent)}Entry.changeSize(${size});\n`
    ),
    'set_scale_size': createSafeStatementGenerator([0], (node, indent, context, [size]) =>
        `${' '.repeat(indent)}Entry.setSize(${size});\n`
    ),
    'stretch_scale_size': createSafeStatementGenerator([0, 1], (node, indent, context, [dimension, size]) =>
        `${' '.repeat(indent)}Entry.strechScaleSize(${dimension}, ${size});\n`
    ),
    'reset_scale_size': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.resetSize();\n`;
    },
    'change_object_index': createSafeStatementGenerator([0], (node, indent, context, [index]) =>
        `${' '.repeat(indent)}Entry.changeObjectIndex(${index});\n`
    ),
    'sound_volume_change': createSafeStatementGenerator([0], (node, indent, context, [volume]) =>
        `${' '.repeat(indent)}Entry.changeVolume(${volume});\n`
    ),
    'sound_volume_set': createSafeStatementGenerator([0], (node, indent, context, [volume]) =>
        `${' '.repeat(indent)}Entry.changeVolume(${volume});\n`
    ),
    'sound_speed_change': createSafeStatementGenerator([0], (node, indent, context, [speed]) =>
        `${' '.repeat(indent)}Entry.changeSoundSpeed(${speed});\n`
    ),
    'sound_speed_set': createSafeStatementGenerator([0], (node, indent, context, [speed]) =>
        `${' '.repeat(indent)}Entry.setSoundSpeed(${speed});\n`
    ),
    'get_sound_volume': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.getVolume();\n`;
    },
    'get_sound_speed': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.getSoundSpeed();\n`;
    },
    'sound_silent_all': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.stopAllSounds();\n`;
    },
    'play_bgm': createSafeStatementGenerator([0], (node, indent, context, [soundID]) =>
        `${' '.repeat(indent)}Entry.playBgm(${soundID});\n`
    ),
    'stop_bgm': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.stopBgm();\n`;
    },
    'ask_and_wait': createSafeStatementGenerator([0], (node, indent, context, [question]) =>
        `${' '.repeat(indent)}await Entry.askAndWait(${question});\n`
    ),
    'set_visible_answer': createSafeStatementGenerator([0], (node, indent, context, [visible]) =>
        `${' '.repeat(indent)}Entry.setVisibleAnswer(${visible});\n`
    ),
    'show_variable': createSafeStatementGenerator([0], (node, indent, context, [variableID]) =>
        `${' '.repeat(indent)}Entry.showVariable(${variableID});\n`
    ),
    'hide_variable': createSafeStatementGenerator([0], (node, indent, context, [variableID]) =>
        `${' '.repeat(indent)}Entry.hideVariable(${variableID});\n`
    ),
    'add_value_to_list': createSafeStatementGenerator([0, 1], (node, indent, context, [value, listID]) =>
        `${' '.repeat(indent)}Entry.variableContainer.addValueToList(${listID}, ${value});\n`
    ),
    'remove_value_from_list': createSafeStatementGenerator([0, 1], (node, indent, context, [index, listID]) =>
        `${' '.repeat(indent)}Entry.variableContainer.removeValueFromList(${listID},${index});\n`
    ),
    'insert_value_to_list': createSafeStatementGenerator([0, 1, 2], (node, indent, context, [list, index, value]) =>
        `${' '.repeat(indent)}Entry.variableContainer.insertValueToList(${list},${index},${value});\n`
    ),
    'change_value_list_index': createSafeStatementGenerator([0, 1, 2], (node, indent, context, [list, index, value]) =>
        `${' '.repeat(indent)}Entry.variableContainer.changeValueListIndex(${list},${index},${value});\n`
    ),
    'show_list': createSafeStatementGenerator([0], (node, indent, context, [list]) =>
        `${' '.repeat(indent)}Entry.showList(${list});\n`
    ),
    'hide_list': createSafeStatementGenerator([0], (node, indent, context, [list]) =>
        `${' '.repeat(indent)}Entry.hideList(${list});\n`
    ),
    'wait_second': createSafeStatementGenerator([0], (node, indent, context, [second]) =>
        `${' '.repeat(indent)}await Entry.waitSeconds(${second});\n`
    ),
    'continue_repeat': (node, indent, context) => {
        return `${' '.repeat(indent)}continue;\n`;
    },
    'restart_project': (node, indent, context) => {
        return `${' '.repeat(indent)}restartProject();\n`;
    },
    'remove_all_clones': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.removeAllClones();\n`;
    },
    'text_write': createSafeStatementGenerator([0], (node, indent, context, [text]) =>
        `${' '.repeat(indent)}Entry.textWrite(${text});\n`
    ),
    'text_append': createSafeStatementGenerator([0], (node, indent, context, [text]) =>
        `${' '.repeat(indent)}Entry.textAppend(${text});\n`
    ),
    'text_prepend': createSafeStatementGenerator([0], (node, indent, context, [text]) =>
        `${' '.repeat(indent)}Entry.textPrepend(${text});\n`
    ),
    'text_change_effect': createSafeStatementGenerator([0, 1], (node, indent, context, [effect, mod]) =>
        `${' '.repeat(indent)}Entry.textChangeEffect(${effect},${mod});\n`
    ),
    'text_change_font': createSafeStatementGenerator([0], (node, indent, context, [font]) =>
        `${' '.repeat(indent)}Entry.textChangeFont(${font});\n`
    ),
    'text_change_font_color': createSafeStatementGenerator([0], (node, indent, context, [color]) =>
        `${' '.repeat(indent)}Entry.textChangeFontColor(${color});\n`
    ),
    'text_change_bg_color': createSafeStatementGenerator([0], (node, indent, context, [color]) =>
        `${' '.repeat(indent)}Entry.textChangeFontBGColor(${color});\n`
    ),
    'text_flush': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.textFlush();\n`;
    },
    //데이터 테이블 (추가)
    'append_row_to_table': createSafeStatementGenerator([0, 1], (node, indent, context, [tableID, row]) =>
        `${' '.repeat(indent)}Entry.CRUD.appendRowtoTable(${tableID}, ${row});\n`
    ),
    'insert_row_to_table': createSafeStatementGenerator([0, 1, 2], (node, indent, context, [tableID, index, row]) =>
        `${' '.repeat(indent)}Entry.CRUD.insertRowtoTable(${tableID}, ${index}, ${row});\n`
    ),
    'delete_row_from_table': createSafeStatementGenerator([0, 1], (node, indent, context, [tableID, index]) =>
        `${' '.repeat(indent)}Entry.CRUD.deleteRowfromTable(${tableID}, ${index});\n`
    ),
    'set_value_from_table': createSafeStatementGenerator([0, 1, 2, 3], (node, indent, context, [tableID, rowIndex, columnName, value]) =>
        `${' '.repeat(indent)}Entry.CRUD.setValuefromTable(${tableID}, ${rowIndex}, ${columnName}, ${value});\n`
    ),
    'set_value_from_cell': createSafeStatementGenerator([0, 1, 2], (node, indent, context, [cellID, columnName, value]) =>
        `${' '.repeat(indent)}Entry.CRUD.setValuefromCell(${cellID}, ${columnName}, ${value});\n`
    ),
    // 붓 블럭
    'brush_stamp': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.brushStamp();\n`
    },
    'start_drawing': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.startDrawing();\n`;
    },
    'stop_drawing': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.stopDrawing();\n`;
    },
    'start_fill': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.startFill();\n`;
    },
    'stop_fill': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.endFill();\n`;
    },
    'set_color': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.setBrushColor(${node.arguments[0]});\n`;
    },
    'set_random_color': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.setRandomColor();\n`;
    },
    'set_fill_color': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.setFillcolor(${node.arguments[0]});`;
    },
    'change_thickness': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.changeBrushThickness(${node.arguments[0]});\n`;
    },
    'set_thickness': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.setBrushThickness(${node.arguments[0]});\n`;
    },
    'change_brush_transparency':(node,indent,context)=>{
        return `${' '.repeat(indent)}Entry.changeBrushTransparency(${node.arguments[0]});\n`;
    },
    'set_brush_tranparency':(node,indent,context)=>{
        return `${' '.repeat(indent)}Entry.setBrushTransparency(${node.arguments[0]});\n`;
    },
    'brush_erase_all':(node,indent,context)=>{
        return `${' '.repeat(indent)}Entry.eraseAllBrush();\n`;
    },
};

function generateStatement(node, indent = 0, context = {}) {
    let generator = statementGenerators[node.type];

    // Handle dynamic function call blocks (e.g., 'func_abcdef')
    if (!generator && node.type.startsWith('func_')) {
        generator = createSafeStatementGenerator([], (node, indent, context, _unusedArgs) => {
            const funcName = `func_${node.funcId || node.type.substring(5)}`;
            const args = node.arguments.map(arg => generateExpression(arg, context)).join(', '); // Pass context
            return `${' '.repeat(indent)}await Entry.lambda.${funcName}(${args});\n`;
        });
    }
    return generator ? generator(node, indent, context) : `${' '.repeat(indent)}// TODO: Statement for '${node.type}' is not implemented.\n`;
}

/**
 * AST 노드 또는 리터럴 값을 JavaScript 표현식(Expression)으로 변환합니다.
 * @param {object|string|number} arg - 변환할 인자 (AST 노드 또는 리터럴)
 * @returns {string} 생성된 JavaScript 표현식
 */
function getOperatorPrecedence(op) {
    const precedence = {
        '||': 1,
        '&&': 2,
        '===': 6, '!==': 6,
        '<': 7, '<=': 7, '>': 7, '>=': 7,
        '+': 9, '-': 9,
        '*': 10, '/': 10, '%': 10,
        '!': 15, // Unary not
    };
    return precedence[op] || 0;
}

function generateExpression(arg, context = {}, parentPrecedence = 0) {
    // 인자가 블록(객체)이 아닌 리터럴 값일 경우
    if (typeof arg !== 'object' || arg === null) {
        // 값의 타입에 따라 처리
        if (typeof arg === 'string') {
            const s = arg;
            // 진법 리터럴 및 숫자 패턴을 확인하여 숫자처럼 보이면 숫자 리터럴로 취급합니다.
            const isRadixLiteral =
                /^[-+]?0[xX][0-9a-fA-F]+$/.test(s) ||
                /^[-+]?0[oO][0-7]+$/.test(s) ||
                /^[-+]?0[bB][01]+$/.test(s);
            const isNumericString = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s.trim());

            if (s.trim() !== '' && (isRadixLiteral || isNumericString)) {
                return s.trim();
            }
            // 숫자 형태가 아니면 안전하게 문자열 리터럴로 처리합니다.
            return JSON.stringify(s);
        }
        // 문자열이 아닌 리터럴(주로 숫자)은 그대로 문자열로 변환하여 반환합니다.
        return String(arg);
    }

    // 인자가 값을 반환하는 블록일 경우
    switch (arg.type) {
        case 'text': {
            const raw = arg.arguments?.[0];
            const s = String(raw);

            // 진법 리터럴(0x, 0o, 0b)은 원형 유지할지 여부를 정책으로 결정
            const isRadixLiteral =
                /^[-+]?0[xX][0-9a-fA-F]+$/.test(s) ||
                /^[-+]?0[oO][0-7]+$/.test(s) ||
                /^[-+]?0[bB][01]+$/.test(s);

            // 명확한 숫자 패턴(정수, 부동소수점, 과학적 표기법)에 맞는지 확인합니다.
            const isNumericString = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s.trim());

            if (s.trim() !== '' && (isRadixLiteral || isNumericString)) {
                return s.trim(); // 숫자처럼 보이면 숫자 리터럴로 변환
            }
            return JSON.stringify(s); // 숫자가 아니면 안전하게 문자열 리터럴로
        }
        case 'number': {
            const raw = arg.arguments?.[0];
            // 'number' 블록의 값이 null, undefined, 또는 빈 문자열일 경우 0으로 처리합니다.
            if (raw === null || typeof raw === 'undefined' || String(raw).trim() === '') {
                return '0';
            }
            const s = String(raw).trim();

            // 'text' 블록과 동일한 숫자 판별 로직을 적용합니다.
            const isRadixLiteral =
                /^[-+]?0[xX][0-9a-fA-F]+$/.test(s) ||
                /^[-+]?0[oO][0-7]+$/.test(s) ||
                /^[-+]?0[bB][01]+$/.test(s);
            const isNumericString = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s);

            if (isRadixLiteral || isNumericString) {
                return s; // 명확한 숫자 형식이면 그대로 반환합니다.
            }
            // 엔트리에서는 숫자 블록에 숫자가 아닌 값이 들어가면 0으로 처리됩니다.
            return 0; // 숫자 형식이 아니면 0으로 처리합니다.
        }
        // 엔트리의 '참/거짓' 블록은 True/False 타입을 가집니다.
        case 'True': return 'true';
        case 'False': return 'false';
        // 계산 블록 처리
        case 'calc_basic': {
            const op = mapOperator(arg.arguments[1]);
            const currentPrecedence = getOperatorPrecedence(op);
            const left = generateExpression(arg.arguments[0], context, currentPrecedence);
            const right = generateExpression(arg.arguments[2], context, currentPrecedence + 1); // Left-associative
            const expression = `${left} ${op} ${right}`;
            if (currentPrecedence < parentPrecedence) {
                return `(${expression})`;
            }
            return expression;
        }
        case 'distance_something': {
            const target = generateExpression(arg.arguments[0], context);
            return `Entry.getDistance(${target})`;
        }
        case 'calc_operation': {
            const left = generateExpression(arg.arguments[0], context);
            const op = JSON.stringify(arg.arguments[1]); // 'floor' 같은 연산자를 문자열로 처리
            return `Entry.calcOperation(${left}, ${op})`;
        }
        case 'length_of_string': {
            const string = generateExpression(arg.arguments[0], context);
            return `String(${string}).length`;
        }
        case 'reverse_of_string': {
            const string = generateExpression(arg.arguments[0], context);
            return `Entry.reverseOfstr(${string})`;
        }
        case 'combine_something': {
            const left = generateExpression(arg.arguments[0], context);
            const right = generateExpression(arg.arguments[1], context);
            return `String(${left}) + String(${right})`;
        }
        case 'char_at': {
            const string = generateExpression(arg.arguments[0], context);
            const index = generateExpression(arg.arguments[1], context);
            return `Entry.charAt(${string},${index})`;
        }
        case 'substring': {
            const string = generateExpression(arg.arguments[0], context);
            const start = generateExpression(arg.arguments[1], context);
            const end = generateExpression(arg.arguments[2], context);
            return `String(${string}).substring(${start} - 1, ${end})`;
        }
        case 'count_match_string': {
            const string = generateExpression(arg.arguments[0], context);
            const pattern = generateExpression(arg.arguments[1], context);
            return `Entry.countMatchString(${string},${pattern})`;
        }
        case 'index_of_string': {
            const string = generateExpression(arg.arguments[0], context);
            const pattern = generateExpression(arg.arguments[1], context);
            return `Entry.indexOfString(${string},${pattern})`;
        }
        case 'replace_string': {
            const string = generateExpression(arg.arguments[0], context);
            const pattern = generateExpression(arg.arguments[1], context);
            const replacement = generateExpression(arg.arguments[2], context);
            return `String(${string}).replace(${pattern}, ${replacement})`;
        }
        case 'change_string_case': {
            const string = generateExpression(arg.arguments[0], context);
            const caseType = generateExpression(arg.arguments[1], context);
            if (caseType === 'toUpperCase') {
                return `String(${string}).toUpperCase()`;
            } else if (caseType === 'toLowerCase') {
                return `String(${string}).toLowerCase()`;
            } else {
                return `String(${string})`; // Fallback
            }
        }
        case 'get_sound_volume':
            return `Entry.getVolume()`;
        case 'get_sound_speed':
            return `Entry.getSoundSpeed()`;
        case 'get_sound_duration': {
            const soundId = generateExpression(arg.arguments[0], context);
            return `Entry.getSoundDuration(${soundId})`;
        }
        case 'get_block_count': {
            const target = generateExpression(arg.arguments[0], context);
            return `Entry.getBlockCount(${target})`;
        }
        case 'change_rgb_to_hex': {
            const r = generateExpression(arg.arguments[0], context);
            const g = generateExpression(arg.arguments[1], context);
            const b = generateExpression(arg.arguments[2], context);
            return `Entry.rgbToHex(${r},${g},${b})`;
        }
        case 'change_hex_to_rgb': {
            const hex = generateExpression(arg.arguments[0], context);
            return `Entry.hexToRgb(${hex})`;
        }
        // 리스트
        case 'value_of_index_from_list': {
            const listId = generateExpression(arg.arguments[0], context);
            const index = generateExpression(arg.arguments[1], context);
            return `Entry.variableContainer.valueOfIndexList(${listId},${index})`;
        }
        case 'length_of_list': {
            const listId = generateExpression(arg.arguments[0], context);
            return `Entry.variableContainer.lengthOfList(${listId})`;
        }
        case 'is_included_in_list': {
            const listId = generateExpression(arg.arguments[0], context);
            const value = generateExpression(arg.arguments[1], context);
            return `Entry.variableContainer.isIncludedInList(${listId},${value})`;
        }
        // 판단
        case 'is_clicked': {
            return 'Entry.isClicked()';
        }
        case 'is_object_clicked': {
            const objecId = generateExpression(arg.arguments[0], context);
            return `Entry.isObjectClicked(${objecId})`;
        }
        case 'is_press_some_key': {
            const keycode = generateExpression(arg.arguments[0], context);
            return `Entry.isPressSomeKey(${keycode})`;
        }
        case 'reach_something': {
            const Something = generateExpression(arg.arguments[0], context);
            return `Entry.reachSomething(${Something})`;
        }
        case 'is_type': {
            const value = generateExpression(arg.arguments[0], context);
            const type = generateExpression(arg.arguments[1], context);
            return `Entry.isType(${value},${type})`;
        }
        case 'boolean_and_or': {
            const op = mapOperator(arg.arguments[1]);
            const currentPrecedence = getOperatorPrecedence(op);
            const left = generateExpression(arg.arguments[0], context, currentPrecedence);
            const right = generateExpression(arg.arguments[2], context, currentPrecedence + 1); // Left-associative
            const expression = `${left} ${op} ${right}`;
            if (currentPrecedence < parentPrecedence) {
                return `(${expression})`;
            }
            return expression;
        }
        case 'boolean_not': {
            const op = '!';
            const currentPrecedence = getOperatorPrecedence(op);
            const operand = generateExpression(arg.arguments[0], context, currentPrecedence);
            const expression = `!${operand}`;
            if (currentPrecedence < parentPrecedence) {
                return `(${expression})`;
            }
            return expression;
        }
        case 'is_touch_supported': {
            return 'Entry.isTouchSupported()';
        }
        case 'is_boost_mode': {
            return 'Entry.isBoostMode()';
        }
        case 'is_current_device_type': {
            const deviceType = generateExpression(arg.arguments[0], context);
            return `Entry.isCurrentDeviceType(${deviceType})`;
        }
        // 리소스게터
        case 'get_pictures': {
            const picParam = generateExpression(arg.arguments[0], context);
            return picParam;
        }
        case 'get_sounds': {
            const soundParam = generateExpression(arg.arguments[0], context);
            return soundParam;
        }
        case 'angle': {
            const angleParam = generateExpression(arg.arguments[0], context);
            return angleParam;
        }
        case 'text_color': {
            const colorParam = generateExpression(arg.arguments[0], context);
            return colorParam;
        }
        // 글상자
        case 'text_read': {
            return `Entry.textRead()`;
        }
        // 대답 가져오기
        case 'get_canvas_input_value': {
            return 'Entry.getCanvasInputValue()';
        }
        // 시스템계정 불러옴
        case 'get_user_name': {
            return `Entry.getUserID()`;
        }
        case 'get_nickname': {
            return `Entry.getUsername()`;
        }
        // 판단 블록의 조건 부분 처리
        case 'boolean_basic_operator': {
            const op = mapOperator(arg.arguments[1]);
            const currentPrecedence = getOperatorPrecedence(op);
            // Comparison operators are non-associative.
            const left = generateExpression(arg.arguments[0], context, currentPrecedence + 1);
            const right = generateExpression(arg.arguments[2], context, currentPrecedence + 1);
            const expression = `${left} ${op} ${right}`;
            if (currentPrecedence < parentPrecedence) {
                return `(${expression})`;
            }
            return expression;
        }

        // 좌표/크기 등 오브젝트의 속성값 블록 처리
        case 'coordinate_object': {
            // arg.arguments 예시: ["self","y"]
            const target = generateExpression(arg.arguments[0], context);
            const prop = generateExpression(arg.arguments[1], context);
            return `Entry.getObjectCoords(${target}, ${prop})`;
        }
        case 'coordinate_mouse': {
            return `Entry.getMouseCoords().${arg.arguments[0]}`;
        }
        case 'quotient_and_mod': {
            //엔트리는 문자열로 매핑된 Argments 를 사용해서 자리가 바뀌는 경우 있는듯 하다.
            const left = generateExpression(arg.arguments[0], context);
            const op = generateExpression(arg.arguments[2], context); // "QUOTIENT" 또는 "MOD"
            const right = generateExpression(arg.arguments[1], context);
            return `Entry.quotientAndmod(${left}, ${op}, ${right})`;
        }
        case 'get_project_timer_value': {
            return `Entry.getTimerValue()`;
        }
        case 'get_date': {
            const param = arg.arguments[0];
            const selectAction = (param && typeof param === 'object' && param.arguments) ? param.arguments[0] : param;
            switch (selectAction) {
                case 'YEAR': return `new Date().getFullYear()`;
                case 'MONTH': return `new Date().getMonth() + 1`;
                case 'DAY': return `new Date().getDate()`;
                case 'HOUR': return `new Date().getHours()`;
                case 'MINUTE': return `new Date().getMinutes()`;
                case 'SECOND': return `new Date().getSeconds()`;
                default:
                    // 알 수 없는 값이 들어올 경우를 대비한 방어 코드
                    return `/* Unsupported date part: ${selectAction} */`;
            }
        }
        // Function-related expressions
        case 'get_func_variable': {
            return toJsId(arg.arguments[0]);
        }
        case 'function_value': {
            // 함수 호출 표현식 생성
            const funcName = `func_${arg.funcId}`;
            const args = arg.arguments.map(a => generateExpression(a, context)).join(', ');
            // 함수 호출 자체가 await를 필요로 하므로, await 키워드를 붙여줍니다.
            // 이 표현식을 사용하는 상위 구문(예: if, while)은 이 await를 처리할 수 있어야 합니다.
            // (예: if (await someAsyncFunc()) { ... })
            return `await Entry.lambda.${funcName}(${args})`;
        }
        case 'calc_rand': {
            const min = generateExpression(arg.arguments[0], context);
            const max = generateExpression(arg.arguments[1], context);
            return `Math.floor(Math.random() * (${max} - ${min} + 1)) + ${min}`;
        }
        case 'get_variable': {
            const varid = generateExpression(arg.arguments[0], context);
            return `Entry.variableContainer.getVariable(${varid})`;
        }
        case 'function_param_string':
        case 'function_param_boolean': {
            // 함수 파라미터 블록을 올바른 변수 이름으로 변환합니다.
            return toJsId(arg.paramId);
        }

        // 데이터 테이블
        case 'get_table_count': {
            const tableId = generateExpression(arg.arguments[0], context);
            const property = generateExpression(arg.arguments[1], context);
            return `Entry.CRUD.getTableCount(${tableId}, ${property})`; // LCOV_EXCL_LINE
        }
        case 'get_table_fields': {
            // get_table_fields 블록은 params에 필드 인덱스를 가집니다.
            const fieldIndex = arg.arguments[0];
            return String(fieldIndex); // 인덱스 자체를 반환하여 API에서 처리하도록 합니다.
        }
        case 'get_value_from_table': {
            const tableId = generateExpression(arg.arguments[0], context);
            const rowIndex = generateExpression(arg.arguments[1], context);
            const columnName = generateExpression(arg.arguments[2], context);
            return `Entry.CRUD.getValuefromTable(${tableId}, ${rowIndex}, ${columnName})`;
        }
        case 'get_value_from_last_row': {
            const tableId = generateExpression(arg.arguments[0], context);
            const columnName = generateExpression(arg.arguments[1], context);
            return `Entry.CRUD.getValuefromLastRow(${tableId}, ${columnName})`;
        }
        case 'get_value_from_cell': {
            const cellId = generateExpression(arg.arguments[0], context);
            const columnName = generateExpression(arg.arguments[1], context);
            return `Entry.CRUD.getValuefromCell(${cellId}, ${columnName})`;
        }
        case 'calc_values_from_table': {
            const tableId = generateExpression(arg.arguments[0], context);
            const calc = generateExpression(arg.arguments[1], context);
            const columnName = generateExpression(arg.arguments[2], context);
            return `Entry.CRUD.calcValuesfromTable(${tableId}, ${calc}, ${columnName})`;
        }
        case 'get_coefficient': {
            const matrix = generateExpression(arg.arguments[0], context);
            const field1 = generateExpression(arg.arguments[1], context);
            const field2 = generateExpression(arg.arguments[2], context);
            return `Entry.CRUD.getCoefficient(${matrix}, ${field1}, ${field2})`;
        }
        case 'get_value_v_lookup': {
            const matrix = generateExpression(arg.arguments[0], context);
            const field = generateExpression(arg.arguments[1], context);
            const ReturnField = generateExpression(arg.arguments[2], context);
            const value = generateExpression(arg.arguments[3], context);
            return `Entry.CRUD.getValuevLookup(${matrix}, ${field}, ${ReturnField}, ${value})`;
        }
        default:
            // 함수 본문 내에서 사용되는 파라미터 블록 처리 (e.g., 'stringParam_o86u')
            if (arg.type.startsWith('stringParam_') || arg.type.startsWith('booleanParam_')) {
                // 이 블록들은 함수 정의 시 생성된 파라미터의 ID를 참조합니다.
                // 이 ID를 JS 변수명으로 변환하여 반환합니다.
                return toJsId(arg.paramId);
            }
            // 값을 반환하는 함수 호출 블록 처리 (e.g., 'func_owwk')
            if (arg.type.startsWith('func_')) {
                const funcId = arg.funcId || arg.type.substring(5);
                const funcName = `func_${funcId}`;
                const args = arg.arguments.map(a => generateExpression(a, context)).join(', ');
                return `await Entry.lambda.${funcName}(${args})`;
            }

            // 미구현 표현식의 경우 null을 반환하여 호출자가 처리하도록 합니다.
            // 이렇게 하면 'if (/* ... */)'와 같은 잘못된 구문이 생성되는 것을 방지합니다.
            console.warn(`Unimplemented expression block type: ${arg.type} objectID: ${context.objectId}`);
            return { error: true, type: arg.type };
    }
}
function test_ast(entryScript, functionId, objectId) {
    const ast = buildAstFromScript(entryScript, functionId, objectId);
    return ast;
}

export { codeGen, test_ast };
