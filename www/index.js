/*
*  동적 앱 페이지
*
*/
const home = `
<header style="align-items: center; display: flex; justify-content: center;">
    <h1>Entry2JS</h1>
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

// 페이지 렌더링
appContainer.innerHTML = home;

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

        // 메인 프로세스로부터 오는 로그를 수신하여 화면에 표시
        window.electronAPI.onProcessLog(addLog);

        // 변환 시작 요청
        const result = await window.electronAPI.startConvert(filePath);

        // 변환 완료 후 '처음으로' 버튼 표시
        document.getElementById('back-to-home').style.display = 'block';

    } else if (targetId === 'back-to-home') {
        // 처음 화면으로 돌아가기
        appContainer.innerHTML = home;
        document.getElementById('log-container').innerHTML="";
    }
});