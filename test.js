//트랜스파일 테스트
import fs from "fs";
import path from "node:path";
import {test_ast} from "./e2jast.js";
var projectJson = JSON.parse(fs.readFileSync(path.join("C:\\Users\\Administrator\\Documents\\entry2js-extract-1751602207820", "project.json"), 'utf8'));
if (Array.isArray(projectJson.objects)) {
    for (const obj of projectJson.objects){
        if (obj&&obj.script){
                console.log(`오브젝트id:${obj.id} 이름:${obj.name}`)
                console.log(test_ast(obj.script));
        }
    }
}