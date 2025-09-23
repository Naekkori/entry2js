import fs from "fs";
import path from "node:path";
import { Worker } from 'worker_threads';
import { app } from 'electron';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        // app.asar 내부에 포함된 워커 파일을 __dirname을 기준으로 찾습니다.
        // 개발 및 패키징 환경 모두에서 동일하게 작동합니다.
        const workerPath = path.join(__dirname, 'transpiler-worker.mjs');

        const worker = new Worker(workerPath, { workerData: { script } });
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
            const scriptFileName = `object_${obj.id}.js`;
            // C++ 엔진에서 사용할 상대 경로. 플랫폼 간 호환성을 위해 '/'를 사용합니다.
            const relativeScriptPath = path.join('script', scriptFileName).replace(/\\/g, '/');

            return transpileInWorker(obj.script, onProgress, 5000)
                .then(generatedCode => {
                    // 변환 성공 시, project.json의 오브젝트에 jscript 키와 경로를 추가합니다.
                    // 참고: C++ Engine.h 에서는 ObjectInfo.scriptPath 를 사용하므로, 필요시 'jscript'를 'scriptPath'로 변경해야 할 수 있습니다.
                    obj.jscript = relativeScriptPath;

                    const absoluteScriptPath = path.join(scriptDir, scriptFileName);
                    return fs.promises.writeFile(absoluteScriptPath, generatedCode);
                })
                .catch(error => {
                    const errorMessage = `❌ 오브젝트 '${obj.name}' (ID: ${obj.id}) 처리 중 오류 발생: ${error.message}`;
                    if (onProgress) onProgress(errorMessage);
                    const errorStack = error.stack || error.toString();
                    return fs.promises.writeFile(path.join(scriptDir, `object_${obj.id}.error.log`), errorStack);
                });
        });
        //TODO:여기에 project.json 의 루트 오브젝트의 functions 배열을 처리하는 걸 추가해야함 (사용자 정의 함수.)
        //TODO:e2jast 에 해당 작업이 구현되어있는거 같음
        /*
        구조 예시
        "functions": [
        {
            "id": "l0uw",
            "type": "normal",
            "localVariables": [],
            "useLocalVariables": false,
            "content": "[[{\"id\":\"srbt\",\"x\":50,\"y\":30,\"type\":\"function_create\",\"params\":[{\"id\":\"gaee\",\"x\":0,\"y\":0,\"type\":\"function_field_label\",\"params\":[\"흔들림\",null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":false,\"assemble\":true,\"extensions\":[]},null],\"statements\":[[{\"id\":\"tcow\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"h8ob\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"270\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"p877\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"8\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"on9p\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"jllx\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"bdb1\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"w6f2\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"90\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"ozlp\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"8\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"vd5t\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"8br8\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"k7mo\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"4oqh\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"0\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"bfff\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"8\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"x7tl\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"tsqu\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"r8qa\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"mjgk\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"180\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"pj2t\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"8\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"jukm\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"f6tr\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"zpyu\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"wdex\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"270\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"l19j\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"4\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"5gy8\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"iwbk\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"elx0\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"2u2z\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"90\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"a9j3\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"4\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"2kaa\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"tjck\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"omg2\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"e20a\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"0\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"4kva\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"4\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"0r7w\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"ibfl\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"o9u6\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"s6a0\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"180\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"7p4o\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"4\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"bbqu\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"oirb\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"puo8\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"5eqg\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"270\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"9cbp\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"2\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"7ebe\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"1i2y\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"uyef\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"45as\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"90\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"jjnn\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"2\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"qidf\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"rs97\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"8lb7\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"mhq6\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"0\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"uddh\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"2\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"hqd7\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"vk3x\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"g4c8\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"cnbi\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"180\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"ejg9\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"2\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"0nmh\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"mz6g\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"cdwr\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"murc\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"270\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"ga9v\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"1\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"ptu9\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"vq0u\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"sa28\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"7fue\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"90\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"blwq\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"1\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"ecnt\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"xpl1\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"vz6o\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"z170\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"0\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"fuqm\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"1\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"kf9w\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"e4pz\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"kret\",\"x\":0,\"y\":0,\"type\":\"move_to_angle\",\"params\":[{\"id\":\"rh3p\",\"x\":0,\"y\":0,\"type\":\"angle\",\"params\":[\"180\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"gwnb\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"1\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"dnbe\",\"x\":0,\"y\":0,\"type\":\"wait_second\",\"params\":[{\"id\":\"ju6c\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"0.01\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]}]],\"movable\":null,\"deletable\":false,\"emphasized\":false,\"readOnly\":null,\"copyable\":false,\"assemble\":true,\"extensions\":[]}]]"
        },
        {
            "id": "pb8h",
            "type": "normal",
            "localVariables": [],
            "useLocalVariables": false,
            "content": "[[{\"id\":\"1vs7\",\"x\":50,\"y\":30,\"type\":\"function_create\",\"params\":[{\"id\":\"1ov4\",\"x\":0,\"y\":0,\"type\":\"function_field_label\",\"params\":[\"버튼 닿음\",null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[[{\"id\":\"5jnw\",\"x\":0,\"y\":0,\"type\":\"repeat_inf\",\"params\":[null,null],\"statements\":[[{\"id\":\"pfd6\",\"x\":0,\"y\":0,\"type\":\"wait_until_true\",\"params\":[{\"id\":\"fvx8\",\"x\":0,\"y\":0,\"type\":\"reach_something\",\"params\":[null,\"mouse\",null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"ljpo\",\"x\":0,\"y\":0,\"type\":\"repeat_basic\",\"params\":[{\"id\":\"4dm6\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"10\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[[{\"id\":\"g7le\",\"x\":0,\"y\":0,\"type\":\"add_effect_amount\",\"params\":[\"transparency\",{\"id\":\"6bdr\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"5\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]}]],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"9rds\",\"x\":0,\"y\":0,\"type\":\"wait_until_true\",\"params\":[{\"id\":\"qljz\",\"x\":0,\"y\":0,\"type\":\"boolean_not\",\"params\":[null,{\"id\":\"7s4k\",\"x\":0,\"y\":0,\"type\":\"reach_something\",\"params\":[null,\"mouse\",null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},{\"id\":\"0y8z\",\"x\":0,\"y\":0,\"type\":\"repeat_basic\",\"params\":[{\"id\":\"rnn7\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"10\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[[{\"id\":\"2a0j\",\"x\":0,\"y\":0,\"type\":\"add_effect_amount\",\"params\":[\"transparency\",{\"id\":\"n8p5\",\"x\":0,\"y\":0,\"type\":\"number\",\"params\":[\"-5\"],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]},null],\"statements\":[],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]}]],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]}]],\"movable\":null,\"deletable\":1,\"emphasized\":false,\"readOnly\":null,\"copyable\":true,\"assemble\":true,\"extensions\":[]}]],\"movable\":null,\"deletable\":false,\"emphasized\":false,\"readOnly\":null,\"copyable\":false,\"assemble\":true,\"extensions\":[]}]]"
        }
        ],
        */
        // 모든 변환 작업이 완료될 때까지 기다립니다.
        await Promise.all(promises);

        // 모든 작업 완료 후, 수정된 project.json을 다시 저장합니다.
        await fs.promises.writeFile(Jsonpath, JSON.stringify(projectJson, null, 4));
        if (onProgress) {
            onProgress(`✅ project.json 파일에 변환된 스크립트 경로를 업데이트했습니다.`);
        }
    }

    // 처리할 오브젝트가 없으면 아무것도 하지 않습니다.
};

export default Transpiler;
