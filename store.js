// アプリケーションの状態を保持する store

// ACTION は store の変更を行う
// CHANGE の数字とかぶってはいけない
// view -> store 
const ACTION = {
    APP_QUIT: 0,

    DIALOG_FILE_OPEN: 10,
    DIALOG_MODAL_MESSAGE: 11,
    DIALOG_MODAL_ERROR: 12,

    FILE_OPEN: 20,

    TAB_CLOSE: 32,
    TAB_ACTIVATE: 33,
    TAB_MOVE: 34,
    TAB_TRANSPARENT: 35,

    SHEET_RESIZE: 40,       // シートサイズの変更
    PANE_SPLITTER_MOVE: 50, // スプリッタ位置の変更

    KONATA_ZOOM: 60,        // 拡大/縮小
    KONATA_MOVE_WHEEL: 61,  // ホイールによるスクロール
    KONATA_MOVE_POS: 62,    // ドラッグによる位置移動
    KONATA_CHANGE_COLOR_SCHEME: 63  // カラースキームの変更
};

// CHANGE は store で行われた変更の通知に使う
// ACTION の数字とかぶってはいけない
// store -> view
const CHANGE = {
    TAB_OPEN: 100,
    TAB_UPDATE: 101,    // タブ切り替え時の更新

    PANE_SIZE_UPDATE: 102,
    PANE_CONTENT_UPDATE: 103,   // ペーンの中身の更新

    DIALOG_FILE_OPEN: 110,
    DIALOG_MODAL_MESSAGE: 111,
    DIALOG_MODAL_ERROR: 112,

    MENU_UPDATE: 120,   // メニュー内容の更新
};

function Store(){
    /* globals riot */
    riot.observable(this);
    
    // この書式じゃないと IntelliSense が効かない
    let electron = require("electron");
    let KonataRenderer = require("./KonataRenderer");
    let Konata = require("./Konata");
    
    /** @type {{
            tabs: {}, 
            nextTabID: number, 
            activeTabID: number,
            activeTab: {},
            sheet: {width: number, height: number},
        }} 
    */
    let self = this;

    // Tab
    this.tabs = {}; // id -> tab
    self.nextTabID = 0;
    self.activeTabID = 0;
    self.activeTab = null;


    // ウィンドウサイズ
    self.sheet = {
        width: 800,
        height: 600
    };

    // ダイアログ
    // 基本的に中継してるだけ
    self.on(ACTION.DIALOG_FILE_OPEN, function(){
        self.trigger(CHANGE.DIALOG_FILE_OPEN);
    });
    self.on(ACTION.DIALOG_MODAL_MESSAGE, function(msg){
        self.trigger(CHANGE.DIALOG_MODAL_MESSAGE, msg);
    });
    self.on(ACTION.DIALOG_MODAL_ERROR, function(msg){
        self.trigger(CHANGE.DIALOG_MODAL_ERROR, msg);
    });

    // ファイルオープン
    self.on(ACTION.FILE_OPEN, function(fileName){
        // Load a file
        let konata = new Konata.Konata();
        if (!konata.OpenFile(fileName)) {
            konata.Close(fileName);
            self.trigger(CHANGE.DIALOG_MODAL_ERROR, `${fileName} の読み込みに失敗しました．`);
            return;
        }
        let renderer = new KonataRenderer.KonataRenderer();
        renderer.init(konata);

        // Create a new tab
        let tab = {
            id: self.nextTabID, 
            fileName: fileName,
            konata: konata,
            renderer: renderer,
            splitterPos: 150,   // スプリッタの位置
            transparent: false, // 透明化の有効無効
            colorScheme: "default",  // カラースキーム
            viewPort: {         // 表示領域
                top: 0,
                left: 0,
                width: 0,
                height: 0,
            },  
        };
        self.tabs[self.nextTabID] = tab;
        self.activeTabID = self.nextTabID;
        self.activeTab = self.tabs[self.activeTabID];
        self.nextTabID++;
       
        self.trigger(CHANGE.TAB_OPEN, self, tab);
        self.trigger(CHANGE.TAB_UPDATE, self, tab);
        self.trigger(CHANGE.PANE_SIZE_UPDATE, self);
        self.trigger(CHANGE.PANE_CONTENT_UPDATE, self);

    });

    // アクティブなタブの変更
    self.on(ACTION.TAB_ACTIVATE, function(id){
        if (!(id in self.tabs)) {
            console.log(`ACTION.TAB_ACTIVATE: invalid id: ${id}`);
            return;
        }

        self.activeTabID = id;
        self.activeTab = self.tabs[self.activeTabID];
        self.trigger(CHANGE.TAB_UPDATE, self);
        self.trigger(CHANGE.PANE_CONTENT_UPDATE, self);
    });

    // タブ移動
    self.on(ACTION.TAB_MOVE, function(next){
        let ids = Object.keys(self.tabs).sort();
        for (let i = 0; i < ids.length; i++) {
            if (self.activeTab.id == ids[i]) {
                let to = next ? ids[(i+1)%ids.length] : ids[(i+ids.length-1)%ids.length];
                self.trigger(ACTION.TAB_ACTIVATE, to);
                break;
            }
        }
    });

    // タブを閉じる
    self.on(ACTION.TAB_CLOSE, function(id){
        if (!(id in self.tabs)) {
            console.log(`ACTION.TAB_CLOSE: invalid id: ${id}`);
            return;
        }

        delete self.tabs[id];
        self.activeTab = null;
        for(let newID in self.tabs){
            self.activeTabID = newID;
            self.activeTab = self.tabs[newID];
            break;
        }
        if (!self.activeTab) {
            self.activeTabID = -1;
        }
        self.trigger(CHANGE.TAB_UPDATE, self);
        self.trigger(CHANGE.PANE_CONTENT_UPDATE, self);
    });

    // タブを透明化
    self.on(ACTION.TAB_TRANSPARENT, function(enable){
        self.activeTab.transparent = enable;
        self.trigger(CHANGE.TAB_UPDATE, self);
        self.trigger(CHANGE.PANE_CONTENT_UPDATE, self);
        self.trigger(CHANGE.MENU_UPDATE, self);
    });

    // ウィンドウのサイズ変更
    self.on(ACTION.SHEET_RESIZE, function(width, height){
        self.sheet.width = width;
        self.sheet.height = height;
        self.trigger(CHANGE.PANE_SIZE_UPDATE, self);
        self.trigger(CHANGE.PANE_CONTENT_UPDATE, self);
    });

    // スプリッタの位置変更
    self.on(ACTION.PANE_SPLITTER_MOVE, function(position){
        self.activeTab.splitterPos = position;
        self.trigger(CHANGE.PANE_SIZE_UPDATE, self);
        self.trigger(CHANGE.PANE_CONTENT_UPDATE, self);
    });

    // アプリケーション終了
    self.on(ACTION.APP_QUIT, function(){
        electron.remote.app.quit();
    });

    // 1段階の拡大/縮小
    // zoomOut は true の際にズームアウト
    // posX, posY はズームの中心点
    self.on(ACTION.KONATA_ZOOM, function(zoomOut, posX, posY){
        let renderer = self.activeTab.renderer;
        renderer.zoom(zoomOut, posX, posY);
        self.trigger(CHANGE.PANE_CONTENT_UPDATE, self);
    });

    // ホイールによる移動
    self.on(ACTION.KONATA_MOVE_WHEEL, function(wheelUp){
        let renderer = self.activeTab.renderer;
        renderer.moveWheel(wheelUp);
        self.trigger(CHANGE.PANE_CONTENT_UPDATE, self);
    });

    // ホイールによる移動
    self.on(ACTION.KONATA_MOVE_POS, function(diff){
        let renderer = self.activeTab.renderer;
        renderer.movePos(diff);
        self.trigger(CHANGE.PANE_CONTENT_UPDATE, self);
    });

    // カラースキームの変更
    self.on(ACTION.KONATA_CHANGE_COLOR_SCHEME, function(scheme){
        self.activeTab.colorScheme = scheme;
        self.activeTab.renderer.changeColorScheme(scheme);
        self.trigger(CHANGE.PANE_CONTENT_UPDATE, self);
        self.trigger(CHANGE.MENU_UPDATE, self);
    });



}


module.exports = Store;
