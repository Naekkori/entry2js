console.log(`[MAIN] app.js loaded at ${Date.now()}`);
import { app, ipcMain, dialog, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

console.log(`[MAIN] Imports loaded at ${Date.now()}`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
var isCompile=false;

console.log(`[MAIN] IPC handlers setting up at ${Date.now()}`);

ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '엔트리프로젝트 파일 을 선택하세요.',
        properties: ['openFile'],
        filters: [
            { name: '엔트리프로젝트', extensions: ['ent'] },
            { name: '모든 파일', extensions: ['*'] }
        ]
    });

    if (canceled) {
        return null; // 사용자가 취소하면 null 반환
    } else {
        return filePaths[0]; // 선택된 파일의 첫 번째 경로를 반환
    }
});
ipcMain.handle('dialog:openCompilerPath', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '컴파일러 경로를 선택하세요.',
        properties: ['openFile'],
        filters: [
            { name: '실행 파일', extensions: ['exe'] },
            { name: '모든 파일', extensions: ['*'] }
        ]
    });

    if (canceled) {
        return null; // 사용자가 취소하면 null 반환
    } else {
        return filePaths[0]; // 선택된 파일의 첫 번째 경로를 반환
    }
});
ipcMain.handle('info:get', async () => {
    const packageInfo ={
        name: app.getName(),
        version: app.getVersion(),
        description: '엔트리 프로젝트를 자바스크립트로 변환하는 도구입니다.',
        author: '내꼬리',
        license: 'MIT'
    }
    return packageInfo;
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
        const { extractPlayEntryProject } = await import("./extract.mjs");
        // extract 함수에 onProgress 콜백을 전달합니다.
        await extractPlayEntryProject(filePath, outputDir, onProgress);

        onProgress('압축 해제 완료. 후속 작업을 진행합니다...');
        const { default: Transpiler } = await import("./transpiler.mjs");
        // 실제 변환프로세스
        await Transpiler(path.join(outputDir, 'project.json'), onProgress)
        if (isCompile) {
            //TODO: 구현필요
        }
        onProgress('✅ 모든 작업이 성공적으로 완료되었습니다.');
        shell.showItemInFolder(outputDir);
        return { success: true, message: '변환 완료' };
    } catch (error) {
        console.error('변환 중 오류 발생:', error);
        onProgress(`❌ 오류 발생: ${error.message}`);
        return { success: false, message: `변환 실패: ${error.message}` };
    }
});

console.log(`[MAIN] IPC handlers set up at ${Date.now()}`);

const createWindow = () => {
    console.log(`[MAIN] createWindow called at ${Date.now()}`);
    // 새로운 브라우저 창을 생성합니다.
    const win = new BrowserWindow({
        width: 950,
        height: 800,
        resizable: false,
        webPreferences: {
            // preload 스크립트 경로를 올바르게 지정합니다.
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets/icons/png/icon.png')
    });

    console.log(`[MAIN] BrowserWindow created at ${Date.now()}`);

    // index.html 파일을 창으로 불러옵니다.
    win.loadFile('www/index.html');
    console.log(`[MAIN] loadFile called at ${Date.now()}`);
    win.setMenu(null);
    // (선택사항) 개발자 도구를 엽니다.
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === "F12") {
            win.webContents.openDevTools();
            event.preventDefault();
        }
    })
    console.log(`[MAIN] createWindow finished at ${Date.now()}`);
};

console.log(`[MAIN] App listeners setting up at ${Date.now()}`);

// Electron이 준비되면(초기화 완료) 브라우저 창을 생성합니다.
app.whenReady().then(() => {
    console.log(`[MAIN] app.whenReady resolved at ${Date.now()}`);
    createWindow();

    // macOS에서 독 아이콘을 클릭했을 때 새 창을 여는 로직
    app.on('activate', () => {
        console.log(`[MAIN] app activate event at ${Date.now()}`);
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 모든 창이 닫혔을 때 앱을 종료합니다. (Windows & Linux)
app.on('window-all-closed', () => {
    console.log(`[MAIN] window-all-closed event at ${Date.now()}`);
    // 모든 플랫폼에서 창이 닫히면 앱을 종료합니다.
    app.quit();
});

console.log(`[MAIN] App listeners set up at ${Date.now()}`);