//트랜스파일 테스트
import fs from "fs";
import {test_ast} from "./e2jast.js";

// 커맨드 라인에서 파일 경로를 인자로 받습니다.
const projectJsonPath = process.argv[2];

if (!projectJsonPath) {
    console.error("Error: Please provide the path to project.json as an argument.");
    console.log("Usage: node test.js <path/to/project.json>");
    process.exit(1);
}

const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
if (Array.isArray(projectJson.objects)) {
    for (const obj of projectJson.objects){
        if (obj&&obj.script){
                console.log(`오브젝트id:${obj.id} 이름:${obj.name}`)
                console.log(test_ast(obj.script));
        }
    }
}