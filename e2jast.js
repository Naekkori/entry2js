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
    return `var_${id.replace(/[\W]/g, '_')}`;
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
                    arguments: (firstBlock.params || []).filter(p => p !== null && typeof p !== 'undefined').map(param =>
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
                const config = eventHandlerConfig[node.eventName];
                if (config) {
                    generatedCode += generateEventHandler(node, config);
                } else {
                    generatedCode += `// TODO: '${node.eventName}' 이벤트 핸들러 구현\n\n`;
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
        param: 'objectId',
        condition: 'objectId === Entry.getId()',
        indent: 2
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

function generateEventHandler(node, config) {
    let code = '';
    const param = config.param || '';
    let condition = config.condition;

    if (config.conditionBuilder) {
        condition = config.conditionBuilder(node.arguments);
        if (condition === null) {
            return `// INFO: 'when_${node.eventName}' block with invalid arguments was skipped.\n\n`;
        }
    }

    code += `Entry.on('${config.event}', async (${param}) => {\n`;
    if (condition) {
        code += `${' '.repeat(2)}if (${condition}) {\n`;
    }

    const bodyIndent = 2 + (config.indent || 0);
    node.handlerBody.forEach(blockNode => {
        code += generateStatement(blockNode, bodyIndent);
    });

    if (condition) code += `${' '.repeat(2)}}\n`;
    code += `});\n\n`;
    return code;
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

const statementGenerators = {
    'move_direction': (node, indent, context) => {
        const distance = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.moveDirection(${distance});\n`;
    },
    'message_cast': (node, indent, context) => {
        if (node.arguments[0] === null || typeof node.arguments[0] === 'undefined') {
            return `${' '.repeat(indent)}// INFO: 'message_cast' statement with a null message ID was skipped.\n`;
        }
        const messageIdExpr = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.messageCast(${messageIdExpr});\n`;
    },
    'move_x': (node, indent, context) => {
        const x = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setX(Entry.getX() + ${x});\n`;
    },
    'move_y': (node, indent, context) => {
        const y = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setY(Entry.getY() + ${y});\n`;
    },
    'locate_x': (node, indent, context) => {
        const x = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setX(${x});\n`;
    },
    'locate_y': (node, indent, context) => {
        const y = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setY(${y});\n`;
    },
    'locate_xy': (node, indent, context) => {
        const x = generateExpression(node.arguments[0]);
        const y = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.locateXY(${x}, ${y});\n`;
    },
    'move_xy_time': (node, indent, context) => {
        const x = generateExpression(node.arguments[0]);
        const y = generateExpression(node.arguments[1]);
        const time = generateExpression(node.arguments[2]);
        return `${' '.repeat(indent)}Entry.moveXYTime(${x}, ${y}, ${time});\n`;
    },
    'locate_xy_time': (node, indent, context) => {
        const x = generateExpression(node.arguments[0]);
        const y = generateExpression(node.arguments[1]);
        const time = generateExpression(node.arguments[2]);
        return `${' '.repeat(indent)}Entry.moveXYTime(${x}, ${y}, ${time});\n`;
    },
    'rotate_relative': (node, indent, context) => {
        const angle = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.rotateRelative(${angle});\n`;
    },
    'direction_relative': (node, indent, context) => {
        const angle = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.rotateRelative(${angle});\n`;
    },
    'rotate_by_time': (node, indent, context) => {
        const angle = generateExpression(node.arguments[0]);
        const time = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.rotateByTime(${angle}, ${time});\n`;
    },
    'direction_relative_duration': (node, indent, context) => {
        const angle = generateExpression(node.arguments[0]);
        const time = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.rotateByTime(${angle}, ${time});\n`;
    },
    'direction_absolute': (node, indent, context) => {
        const angle = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setDirection(${angle});\n`;
    },
    'see_angle_object': (node, indent, context) => {
        const angle = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.seeAngleObj(${angle});\n`;
    },
    'move_to_angle': (node, indent, context) => {
        const angle = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.moveToangle(${angle});`;
    },
    'sound_something_with_block': (node, indent, context) => {
        const soundId = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.playSound(${soundId});\n`;
    },
    'sound_something_second_with_block': (node, indent, context) => {
        const soundId = generateExpression(node.arguments[0]);
        const duration = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.playSoundForDuration(${soundId}, ${duration});\n`;
    },
    'sound_something_wait_with_block': (node, indent, context) => {
        const soundId = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.waitforPlaysound(${soundId});\n`;
    },
    'sound_something_second_wait_with_block': (node, indent, context) => {
        const soundId = generateExpression(node.arguments[0]);
        const duration = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.waitforPlaysoundWithSeconds(${soundId}, ${duration});\n`;
    },
    'sound_from_to_and_wait': (node, indent, context) => {
        const soundId = generateExpression(node.arguments[0]);
        const from = generateExpression(node.arguments[1]);
        const to = generateExpression(node.arguments[2]);
        return `${' '.repeat(indent)}Entry.waitforPlaysoundFromto(${soundId}, ${from}, ${to});\n`;
    },
    'sound_from_to': (node, indent, context) => {
        const soundId = generateExpression(node.arguments[0]);
        const from = generateExpression(node.arguments[1]);
        const to = generateExpression(node.arguments[2]);
        return `${' '.repeat(indent)}Entry.playSoundFromto(${soundId}, ${from}, ${to});\n`;
    },
    'locate': (node, indent, context) => {
        const targetObjectID = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.locate(${targetObjectID});\n`;
    },
    'bounce_wall': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.bounceWall();\n`;
    },
    'dialog': (node, indent, context) => {
        const message = generateExpression(node.arguments[0]);
        const option = generateExpression(node.arguments[1]);
        const time = generateExpression(node.arguments[2]);
        return `${' '.repeat(indent)}Entry.dialog(${message}, ${option}, ${time});\n`;
    },
    'remove_dialog': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.removeDialog();\n`;
    },
    'change_shape': (node, indent, context) => {
        const shapeId = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.changeShape(${shapeId});\n`;
    },
    'change_effect_amount': (node, indent, context) => {
        const effect = generateExpression(node.arguments[0]);
        const amount = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.changeEffectAmount(${effect}, ${amount});\n`;
    },
    'clear_effects': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.clearEffects();\n`;
    },
    'change_size': (node, indent, context) => {
        const size = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.changeSize(${size});\n`;
    },
    'set_size': (node, indent, context) => {
        const set_size_amount = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setSize(${set_size_amount});\n`;
    },
    'flip_x': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.flipX();\n`;
    },
    'flip_y': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.flipY();\n`;
    },
    'show': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.setVisibility(true);\n`;
    },
    'hide': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.setVisibility(false);\n`;
    },
    '_if': (node, indent, context) => {
        const condition = generateExpression(node.arguments[0]);
        let code = `${' '.repeat(indent)}if (${condition}) {\n`;
        node.statements[0]?.forEach(stmt => {
            code += generateStatement(stmt, indent + 4, context);
        });
        code += `${' '.repeat(indent)}}\n`;
        return code;
    },
    'if_else': (node, indent, context) => {
        const condition = generateExpression(node.arguments[0]);
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
    },
    'repeat_inf': (node, indent, context) => {
        let code = `${' '.repeat(indent)}while (true) {\n`;
        node.statements[0]?.forEach(stmt => {
            code += generateStatement(stmt, indent + 4, context);
        });
        code += `${' '.repeat(indent + 4)}await Entry.deltaTimeDelay();\n`;
        code += `${' '.repeat(indent)}}\n`;
        return code;
    },
    'repeat_basic': (node, indent, context) => {
        const loopLevel = context.loopLevel || 0;
        const loopVar = `fe_loop_${loopLevel}`; // 항상 고유한 이름 생성
        const newContext = { ...context, loopLevel: loopLevel + 1 };
        const count = generateExpression(node.arguments[0]);
        let code = `${' '.repeat(indent)}for (let ${loopVar} = 0; ${loopVar} < ${count}; ${loopVar}++) {\n`;
        node.statements[0]?.forEach(stmt => {
            code += generateStatement(stmt, indent + 4, newContext);
        });
        code += `${' '.repeat(indent + 4)}await Entry.deltaTimeDelay();\n`;
        code += `${' '.repeat(indent)}}\n`;
        return code;
    },
    'repeat_while_true': (node, indent, context) => {
        const condition = generateExpression(node.arguments[0]);
        let code = `${' '.repeat(indent)}while (${condition}) {\n`;
        node.statements[0]?.forEach(stmt => {
            code += generateStatement(stmt, indent + 4, context);
        });
        code += `${' '.repeat(indent + 4)}await Entry.deltaTimeDelay();\n`;
        code += `${' '.repeat(indent)}}\n`;
        return code;
    },
    'stop_repeat': (node, indent, context) => {
        return `${' '.repeat(indent)}break;\n`;
    },
    'set_func_variable': (node, indent, context) => {
        const varName = toJsId(node.arguments[0]);
        const value = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}${varName} = ${value};\n`;
    },
    'wait_until_true': (node, indent, context) => {
        const condition = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}await Entry.waitUntilTrue(() => ${condition});\n`;
    },
    'function_general': (node, indent, context) => {
        const funcName = `func_${node.funcId}`;
        const args = node.arguments.map(arg => generateExpression(arg)).join(', ');
        return `${' '.repeat(indent)}await ${funcName}(${args});\n`;
    },
    'set_variable': (node, indent, context) => {
        const varid = generateExpression(node.arguments[0]);
        const value = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.setVariable(${varid}, ${value});\n`;
    },
    'change_variable': (node, indent, context) => {
        const varid = generateExpression(node.arguments[0]);
        const value = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.changeVariable(${varid}, ${value});\n`;
    },
    'start_scene': (node, indent, context) => {
        const sceneId = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.startScene(${sceneId});\n`;
    },
    'start_neighbor_scene': (node, indent, context) => {
        const sceneId = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.startNeighborScene(${sceneId});\n`;
    },
    'create_clone': (node, indent, context) => {
        const targetObjectID = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.createClone(${targetObjectID});\n`;
    },
    'delete_clone': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.deleteClone();\n`;
    },
    'stop_object': (node, indent, context) => {
        const targetOption = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.stopObject(${targetOption});\n`;
    },
    'choose_project_timer_action': (node, indent, context) => {
        const action = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setTimerAction(${action});\n`;
    },
    'set_visible_project_timer': (node, indent, context) => {
        const visible = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setVisibleTimer(${visible});\n`;
    },
    'locate_object_time': (node, indent, context) => {
        const id = generateExpression(node.arguments[0]);
        const time = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.locateObjectTime(${id}, ${time});\n`;
    },
    'rotate_absolute': (node, indent, context) => {
        const angle = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setAngle(${angle});\n`;
    },
    'change_to_next_shape': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.changeShapeNext();\n`;
    },
    'change_to_some_shape': (node, indent, context) => {
        const shapeId = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.changeShape(${shapeId});\n`;
    },
    'add_effect_amount': (node, indent, context) => {
        const amount = generateExpression(node.arguments[0]);
        const effect = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.addEffectAmount(${effect}, ${amount});\n`;
    },
    'change_scale_size': (node, indent, context) => {
        const size = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.changeSize(${size});\n`;
    },
    'set_scale_size': (node, indent, context) => {
        const size = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setSize(${size});\n`;
    },
    'stretch_scale_size': (node, indent, context) => {
        const dimension = generateExpression(node.arguments[0]);
        const size = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.strechScaleSize(${dimension}, ${size});\n`;
    },
    'reset_scale_size': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.resetSize();\n`;
    },
    'change_object_index': (node, indent, context) => {
        const index = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.changeObjectIndex(${index});\n`;
    },
    'sound_volume_change': (node, indent, context) => {
        const volume = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.changeVolume(${volume});\n`;
    },
    'sound_volume_set': (node, indent, context) => {
        const volume = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.changeVolume(${volume});\n`;
    },
    'sound_speed_change': (node, indent, context) => {
        const speed = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.changeSpeed(${speed});\n`;
    },
    'sound_speed_set': (node, indent, context) => {
        const speed = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.changeSpeed(${speed});\n`;
    },
    /*'get_sound_volume': (node, indent, context)=>{
        return `${' '.repeat(indent)}Entry.getVolume();\n`;
    },*/
    /*'get_sound_speed':(node, indent, context)=>{
        return `${' '.repeat(indent)}Entry.getSoundSpeed();\n`;
    },*/
    'sound_silent_all': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.stopAllSounds();\n`;
    },
    'play_bgm': (node, indent, context) => {
        const soundID = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.playBgm(${soundID});\n`;
    },
    'stop_bgm': (node, indent, context) => {
        return `${' '.repeat(indent)}Entry.stopBgm();\n`;
    },
    'ask_and_wait': (node, indent, context) => {
        const question = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.askAndWait(${question});\n`;
    },
    'set_visible_answer': (node, indent, context) => {
        const visible = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.setVisibleAnswer(${visible});\n`;
    },
    'show_variable':(node,indent,context)=>{
        const variableID = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.showVariable(${variableID});\n`;
    },
    'hide_variable':(node,indent,context)=>{
        const variableID = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.hideVariable(${variableID});\n`;
    },
    'add_value_to_list':(node,indent,context)=>{
        const list = generateExpression(node.arguments[0]);
        const value = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.variableContainer.addValueToList(${list},${value});\n`;
    },
    'remove_value_from_list':(node,indent,context)=>{
        const list = generateExpression(node.arguments[0]);
        const index = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.variableContainer.removeValueFromList(${list},${index});\n`;
    },
    'insert_value_to_list':(node,indent,context)=>{
        const list = generateExpression(node.arguments[0]);
        const index = generateExpression(node.arguments[1]);
        const value = generateExpression(node.arguments[2]);
        return `${' '.repeat(indent)}Entry.variableContainer.insertValueToList(${list},${index},${value});\n`;
    },
    'change_value_list_index':(node,indent,context)=>{
        const list = generateExpression(node.arguments[0]);
        const index = generateExpression(node.arguments[1]);
        const value = generateExpression(node.arguments[2]);
        return `${' '.repeat(indent)}Entry.variableContainer.changeValueListIndex(${list},${index},${value});\n`;
    },
    'show_list':(node,indent,context)=>{
        const list = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.showList(${list});\n`;
    },
    'hide_list':(node,indent,context)=>{
        const list = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.hideList(${list});\n`;
    },
    'wait_second':(node,indent,context)=>{
        const second = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.waitSecond(${second});\n`;
    },
    'continue_repeat':(node,indent,context)=>{
        return `${' '.repeat(indent)}continue;\n`;
    },
    'restart_project':(node,indent,context)=>{
        return `${' '.repeat(indent)}restartProject();\n`;
    },
    'remove_all_clones':(node,indent,context)=>{
        return `${' '.repeat(indent)}Entry.removeAllClones();\n`;
    },
    'text_write':(node,indent,context)=>{
        const text = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.textWrite(${text});\n`;
    },
    'text_append':(node,indent,context)=>{
        const text = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.textAppend(${text});\n`;
    },
    'text_prepend':(node,indent,context)=>{
        const text = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.textPrepend(${text});\n`;
    },
    'text_change_effect':(node,indent,context)=>{
        const effect = generateExpression(node.arguments[0]);
        const mod = generateExpression(node.arguments[1]);
        return `${' '.repeat(indent)}Entry.textChangeEffect(${effect},${mod});\n}`;
    },
    'text_change_font':(node,indent,context)=>{
        const font = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.textChangeFont(${font});\n`;
    },
    'text_change_font_color':(node,indent,context)=>{
        const color = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.textChangeFontColor(${color});\n`;
    },
    'text_change_bg_color':(node,indent,context)=>{
        const color = generateExpression(node.arguments[0]);
        return `${' '.repeat(indent)}Entry.textChangeFontBGColor(${color});\n`;
    },
    'text_flush':(node,indent,context)=>{
        return `${' '.repeat(indent)}Entry.textFlush();\n`;
    },
};

function generateStatement(node, indent = 0, context = {}) {
    const generator = statementGenerators[node.type];
    return generator ? generator(node, indent, context) : `${' '.repeat(indent)}// TODO: Statement for '${node.type}' is not implemented.\n`;
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
        case 'text': {
            const textValue = (arg.arguments && arg.arguments[0]) || '';
            // isFinite는 공백 문자열을 0으로 취급하므로, 비어있지 않은지 확인합니다.
            // 또한, isFinite는 " 123 "과 같은 공백이 있는 숫자도 true로 반환합니다.
            // JavaScript의 자동 타입 변환과 일치하므로 이 동작은 괜찮습니다.
            if (textValue.trim() !== '' && isFinite(textValue)) {
                return textValue; // 숫자와 유사한 문자열은 숫자 리터럴로 반환
            }
            return JSON.stringify(textValue); // 그 외에는 문자열 리터럴로 반환
        }
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
        case 'distance_something': {
            const target = generateExpression(arg.arguments[0]);
            return `Entry.getDistance(${target})`;
        }
        case 'calc_operation': {
            const left = generateExpression(arg.arguments[0]);
            const op = mapOperator(arg.arguments[1])
            return `Entry.calcOperation(${left},${op})`;
        }
        case 'length_of_string': {
            const string = generateExpression(arg.arguments[0]);
            return `String(${string}).length`;
        }
        case 'reverse_of_string': {
            const string = generateExpression(arg.arguments[0]);
            return `Entry.reverseOfstr(${string})`;
        }
        case 'combine_something': {
            const left = generateExpression(arg.arguments[0]);
            const right = generateExpression(arg.arguments[1]);
            return `String(${left}) + String(${right})`;
        }
        case 'char_at': {
            const string = generateExpression(arg.arguments[0]);
            const index = generateExpression(arg.arguments[1]);
            return `Entry.charAt(${string},${index})`;
        }
        case 'substring': {
            const string = generateExpression(arg.arguments[0]);
            const start = generateExpression(arg.arguments[1]);
            const end = generateExpression(arg.arguments[2]);
            return `String(${string}).substring(${start},${end});`;
        }
        case 'count_match_string': {
            const string = generateExpression(arg.arguments[0]);
            const pattern = generateExpression(arg.arguments[1]);
            return `Entry.countMatchString(${string},${pattern})`;
        }
        case 'index_of_string': {
            const string = generateExpression(arg.arguments[0]);
            const pattern = generateExpression(arg.arguments[1]);
            return `Entry.indexOfString(${string},${pattern})`;
        }
        case 'replace_string': {
            const string = generateExpression(arg.arguments[0]);
            const pattern = generateExpression(arg.arguments[1]);
            const replacement = generateExpression(arg.arguments[2]);
            return `String(${string}).replace(${pattern},${replacement})`;
        }
        case 'change_string_case': {
            const string = generateExpression(arg.arguments[0]);
            const caseType = generateExpression(arg.arguments[1]);
            switch (caseType) {
                case 'upper':
                    return `String(${string}).toUpperCase()`;
                case 'lower':
                    return `String(${string}).toLowerCase()`;
                default:
                    return `String(${string})`;
            }
        }
        case 'get_sound_volume':
            return `Entry.getVolume()`;
        case 'get_sound_speed':
            return `Entry.getSoundSpeed()`;
        case 'get_sound_duration': {
            const soundId = generateExpression(arg.arguments[0]);
            return `Entry.getSoundDuration(${soundId})`;
        }
        case 'get_block_count': {
            const target = generateExpression(arg.arguments[0]);
            return `Entry.getBlockCount(${target})`;
        }
        case 'change_rgb_to_hex': {
            const r = generateExpression(arg.arguments[0]);
            const g = generateExpression(arg.arguments[1]);
            const b = generateExpression(arg.arguments[2]);
            return `Entry.rgbToHex(${r},${g},${b})`;
        }
        case 'change_hex_to_rgb': {
            const hex = generateExpression(arg.arguments[0]);
            return `Entry.hexToRgb(${hex})`;
        }
        // 리스트
        case 'value_of_index_from_list': {
            const listId = generateExpression(arg.arguments[0]);
            const index = generateExpression(arg.arguments[1]);
            return `Entry.variableContainer.valueOfIndexList(${listId},${index})`;
        }
        case 'length_of_list':{
            const listId = generateExpression(arg.arguments[0]);
            return `Entry.variableContainer.lengthOfList(${listId})`;
        }
        case 'is_included_in_list':{
            const listId = generateExpression(arg.arguments[0]);
            const value = generateExpression(arg.arguments[1]);
            return `Entry.variableContainer.isIncludedInList(${listId},${value})`;
        }
        // 판단
        case 'is_clicked': {
            return 'Entry.isClicked()';
        }
        case 'is_object_clicked':{
            const objecId = generateExpression(arg.arguments[0]);
            return `Entry.isObjectClicked(${objecId})`;
        }
        case 'is_press_some_key':{
            const keycode = generateExpression(arg.arguments[0]);
            return `Entry.isPressSomeKey(${keycode})`;
        }
        case 'reach_something':{
            const Something = generateExpression(arg.arguments[0]);
            return `Entry.reachSomething(${Something})`;
        }
        case 'is_type':{
            const value = generateExpression(arg.arguments[0]);
            const type = generateExpression(arg.arguments[1]);
            return `Entry.isType(${value},${type})`;
        }
        case 'boolean_and_or':{
            const bop1 = generateExpression(arg.arguments[0]);
            const op = arg.arguments[1];
            const bop2 = generateExpression(arg.arguments[2]);
            if (op==='AND') {
                return `(${bop1} && ${bop2})`;
            } else if (op==='OR') {
                return `(${bop1} || ${bop2})`;
            }
        }
        case 'boolean_not':{
            const bop = generateExpression(arg.arguments[0]);
            return `!${bop}`;
        }
        case 'is_touch_supported':{
            return 'Entry.isTouchSupported()';
        }
        case 'is_boost_mode':{
            return 'Entry.isBoostMode()';
        }
        case 'is_current_device_type':{
            const deviceType = generateExpression(arg.arguments[0]);
            return `Entry.isCurrentDeviceType(${deviceType})`;
        }
        // 리소스게터
        case 'get_pictures':{
            const picParam = generateExpression(arg.arguments[0]);
            return picParam;
        }
        case 'get_sounds':{
            const soundParam = generateExpression(arg.arguments[0]);
            return soundParam;
        }
        case 'angle':{
            const angleParam = generateExpression(arg.arguments[0]);
            return angleParam;
        }
        case 'text_color':{
            const colorParam = generateExpression(arg.arguments[0]);
            return colorParam;
        }
        // 글상자
        case 'text_read':{
            const text = generateExpression(arg.arguments[0]);
            return `Entry.textRead(${text})`;
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
            const left = generateExpression(arg.arguments[0]);
            const op = mapOperator(arg.arguments[1]);
            const right = generateExpression(arg.arguments[2]);
            return `(${left} ${op} ${right})`;
        }

        // 좌표/크기 등 오브젝트의 속성값 블록 처리
        case 'coordinate_object': {
            // arg.arguments 예시: ["self","y"]
            const target = generateExpression(arg.arguments[0]);
            const prop = generateExpression(arg.arguments[1]);
            return `Entry.getObjectCoords(${target}, ${prop})`;
        }
        case 'coordinate_mouse': {
            const prop = generateExpression(arg.arguments[0]);
            return `Entry.getMouseCoords(${prop})`;
        }
        case 'quotient_and_mod': {
            const left = generateExpression(arg.arguments[0]);
            const op = generateExpression(arg.arguments[1]);
            const right = generateExpression(arg.arguments[2]);
            return `Entry.quotientAndmod(${left},${op},${right})`;
        }
        case 'get_project_timer_value': {
            return `Entry.getTimerValue()`;
        }
        case 'get_date': {
            // generateExpression 대신, 인자에서 텍스트 값을 직접 추출합니다.
            const selectAction = arg.arguments[0]?.arguments[0];
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
            const funcName = `func_${arg.funcId}`;
            const args = arg.arguments.map(a => generateExpression(a)).join(', ');
            return `await ${funcName}(${args})`;
        }
        case 'calc_rand': {
            const min = generateExpression(arg.arguments[0]);
            const max = generateExpression(arg.arguments[1]);
            return `Math.floor(Math.random() * (${max} - ${min} + 1)) + ${min}`;
        }
        case 'get_variable': {
            const varid = generateExpression(arg.arguments[0]);
            return `Entry.getVariable(${varid})`;
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