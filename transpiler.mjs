import fs from "fs";
import path from "node:path";

const Transpiler = async (Jsonpath)=>{
    var withoutProjectJson = Jsonpath.replace(/project\.json$/, '')
    if (!fs.existsSync(Jsonpath)) {
        throw new Error(`File not found: ${Jsonpath}`);
    }else if (!fs.existsSync(path.join(withoutProjectJson,'script'))){
        fs.mkdirSync(path.join(withoutProjectJson,'script'));
    }
    //project JSON 파싱
    //const projectJson = JSON.parse(fs.readFileSync(Jsonpath, 'utf8'));
}
export  default Transpiler