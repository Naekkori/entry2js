/*
*  동적 앱 페이지
*
*/
const home = `
<header style="align-items: center; display: flex; justify-content: center;">
    <img src="E2JS.svg" width="100px">
    <h1 style="color:black; m;">Entry2JS</h1>
</header>
<span>엔트리프로젝트 를 FastEntry 자바스크립트 로 트랜스파일 하는 도구입니다.</span>
<br>
<button id="open">
    <span>열기</span>
</button>
`;

// 변환 중일 때 보여줄 페이지
const processingPage = `
<header>
    <h1>변환 중...</h1>
</header>
<div id="log-container" style="width: 80%; height: 300px; background-color: #2e2e2e; color: #f0f0f0; border: 1px solid #555; overflow-y: auto; padding: 10px; font-family: monospace; border-radius: 4px;">
</div>
<button id="back-to-home" style="margin-top: 1rem; display: none;">처음으로 돌아가기</button>
`;

const appContainer = document.getElementById("app");

// 로그를 화면에 출력하는 함수
const addLog = (message) => {
    const logContainer = document.getElementById('log-container');
    if (logContainer) {
        logContainer.innerHTML += `<div>${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
        logContainer.scrollTop = logContainer.scrollHeight; // 자동 스크롤
    }
};
function closeSettings() {
    document.getElementById('setting_container').classList.remove('show');
}
function openSettings() {
    document.getElementById('setting_container').classList.add('show');
}
function EnableCompile(checkboxElement) {
    console.log(`CompileEnabled: ${checkboxElement.checked}`);
    console.log(checkboxElement); // 전달된 요소 확인용
    EnableByteCodeCompiler(checkboxElement.checked);
}
function EnableByteCodeCompiler(val) {
    localStorage.setItem("ByteCodeCompile", val);
    const bytecodePathInput = document.getElementById("bytecode_compile_path");
    const bytecodeBtn = document.getElementById("bytecode_compile_btn");
    if (bytecodePathInput) {
        // val이 true이면 disabled=false (활성화), val이 false이면 disabled=true (비활성화)
        bytecodePathInput.disabled = !val;
        bytecodeBtn.disabled = !val;
    }
}
function SetCompilePath(textbox) {
    localStorage.setItem("BytecodePath", textbox.value);
}
async function OpenCompilerPath() {
    try {
        // electronAPI.openCompilerPath가 Promise를 반환
        const path = await window.electronAPI.openCompilerPath();

        // 사용자가 파일 선택을 취소하지 않은 경우(path가 존재할 경우)에만 경로를 업데이트합니다.
        if (path) {
            const compilerPathInput = document.getElementById("bytecode_compile_path");
            if (compilerPathInput) {
                compilerPathInput.value = path;
                SetCompilePath(compilerPathInput);
            }
        }
    } catch (err) {
        console.error('Error opening compiler path dialog:', err);
        alert(`컴파일러 경로를 여는 중 오류가 발생했습니다: ${err.message || err}`);
    }
}
window.onload = async function () {
    // 페이지 렌더링
    appContainer.innerHTML = home;
    await getInfo();
    // 로컬스토리지 준비
    const byteCodePath = localStorage.getItem("BytecodePath");
    const byteCodeCompileStr = localStorage.getItem("ByteCodeCompile");

    if (byteCodePath !== null) {
        document.getElementById("bytecode_compile_path").value = byteCodePath;
    } else {
        localStorage.setItem("BytecodePath", "");
    }

    if (byteCodeCompileStr !== null) {
        const isCompileEnabled = (byteCodeCompileStr === 'true');
        document.getElementById("bytecode_compile").checked = isCompileEnabled;
        EnableByteCodeCompiler(isCompileEnabled);
    } else {
        localStorage.setItem("ByteCodeCompile", false);
    }
};
async function getInfo() {
    const returnInfo = await window.electronAPI.getProgramInfo();
    const Info = document.getElementById("info");
    Info.innerHTML = `이름: ${returnInfo.name}<br>버전: ${returnInfo.version}<br>설명: ${returnInfo.description}<br>작성자: ${returnInfo.author}<br>라이선스: ${returnInfo.license}`;
}
// 이벤트 위임을 사용하여 동적으로 생성되는 버튼도 처리
document.body.addEventListener("click", async (event) => {
    const targetId = event.target.id || event.target.closest('button')?.id;

    if (targetId === 'open') {
        const filePath = await window.electronAPI.openFile();
        if (!filePath) {
            console.log('파일 선택이 취소되었습니다.');
            return;
        }

        // UI를 '처리 중' 상태로 변경
        appContainer.innerHTML = processingPage;
        document.getElementsByTagName('h1')[0].innerHTML = "변환중 입니다...";

        // 메인 프로세스로부터 오는 로그를 수신하여 화면에 표시
        window.electronAPI.onProcessLog(addLog);

        // 변환 시작 요청
        const result = await window.electronAPI.startConvert(filePath);

        // 변환 완료 후 '처음으로' 버튼 표시
        document.getElementById('back-to-home').style.display = 'block';
        document.getElementsByTagName('h1')[0].innerHTML = "변환 완료";

    } else if (targetId === 'back-to-home') {
        // 처음 화면으로 돌아가기
        appContainer.innerHTML = home;
        document.getElementById('log-container').innerHTML = "";
    } else if (targetId === 'bytecode_compile_btn') {
        OpenCompilerPath();
    }
});