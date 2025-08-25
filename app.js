import {app, ipcMain, dialog, BrowserWindow,shell} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractPlayEntryProject} from "./extract.mjs";
import Transpiler from "./transpiler.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
ipcMain.handle('dialog:openFile', async () => {
    const {canceled, filePaths} = await dialog.showOpenDialog({
        title: '엔트리프로젝트 파일 을 선택하세요.',
        properties: ['openFile'],
        filters: [
            {name: '엔트리프로젝트', extensions: ['ent']},
            {name: '모든 파일', extensions: ['*']}
        ]
    });

    if (canceled) {
        return null; // 사용자가 취소하면 null 반환
    } else {
        return filePaths[0]; // 선택된 파일의 첫 번째 경로를 반환
    }
});
ipcMain.handle('conv:Start', async (event, filePath) => {
    if (!filePath) {
        return { success: false, message: '파일 경로가 없습니다.' };
    }

    // 렌더러로 메시지를 보낼 때 사용할 webContents 객체
    const webContents = event.sender;
    // 압축 해제할 디렉토리 경로
    const outputDir = path.join(app.getPath('documents'), `entry2js-extract-${Date.now()}`);

    // 진행 상황 로그를 렌더러로 전송하는 콜백 함수
    const onProgress = (logMessage) => {
        webContents.send('proc:log', logMessage);
    };

    try {
        onProgress('변환 프로세스를 시작합니다...');
        // extract 함수에 onProgress 콜백을 전달합니다.
        await extractPlayEntryProject(filePath, outputDir, onProgress);

        onProgress('압축 해제 완료. 후속 작업을 진행합니다...');
        // TODO: 실제 변환프로세스
        await Transpiler(path.join(outputDir, 'project.json'))
        onProgress('✅ 모든 작업이 성공적으로 완료되었습니다.');
        shell.showItemInFolder(outputDir);
        return { success: true, message: '변환 완료' };
    } catch (error) {
        console.error('변환 중 오류 발생:', error);
        onProgress(`❌ 오류 발생: ${error.message}`);
        return { success: false, message: `변환 실패: ${error.message}` };
    }
});
const createWindow = () => {
    // 새로운 브라우저 창을 생성합니다.
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        resizable: false,
        webPreferences: {
            // preload 스크립트 경로를 올바르게 지정합니다.
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // index.html 파일을 창으로 불러옵니다.
    win.loadFile('www/index.html');
    win.setMenu(null);
    // (선택사항) 개발자 도구를 엽니다.
    win.webContents.on('before-input-event', (event,input) => {
        if (input.key==="F12"){
            win.webContents.openDevTools();
            event.preventDefault();
        }
    })
};

// Electron이 준비되면(초기화 완료) 브라우저 창을 생성합니다.
app.whenReady().then(() => {
    createWindow();

    // macOS에서 독 아이콘을 클릭했을 때 새 창을 여는 로직
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 모든 창이 닫혔을 때 앱을 종료합니다. (Windows & Linux)
app.on('window-all-closed', () => {
    // 모든 플랫폼에서 창이 닫히면 앱을 종료합니다.
    app.quit();
});