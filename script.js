// --- START OF FILE script.js ---
// 1단계에서 복사한 Firebase 구성 객체를 여기에 붙여넣으세요.
const firebaseConfig = {
   apiKey: "AIzaSyBCxtMT6ANE-7NHOZdLz-YfqT9tA0foODM",
   authDomain: "minjiword.firebaseapp.com",
   projectId: "minjiword",
   storageBucket: "minjiword.firebasestorage.app",
   messagingSenderId: "1094625947864",
   appId: "1:1094625947864:web:f71bd42fbc7c8d72ba27ad"
};

  // Firebase 앱 초기화
  firebase.initializeApp(firebaseConfig);
  
  // Firestore 데이터베이스 서비스에 대한 참조 생성
  const db = firebase.firestore();
  
  // (참고) 나중에 TTS 기능을 위해 추가할 코드입니다. 지금은 주석 처리해 두세요.
  // const functions = firebase.functions()

const voiceOptions = {
    "ko-KR": { name: "한국어", voices: ["ko-KR-Standard-A", "ko-KR-Standard-B", "ko-KR-Standard-C", "ko-KR-Standard-D"] },
    "en-US": { name: "영어 (US)", voices: ["en-US-Standard-A", "en-US-Standard-B", "en-US-Standard-C", "en-US-Standard-D"] },
    "fr-FR": { name: "프랑스어", voices: ["fr-FR-Standard-A", "fr-FR-Standard-B", "fr-CA-Standard-B", "fr-CA-Standard-C"] },
    "ja-JP": { name: "일본어", voices: ["ja-JP-Standard-A", "ja-JP-Standard-B", "ja-JP-Standard-C", "ja-JP-Standard-D"] },
    "cmn-CN": { name: "중국어", voices: ["cmn-CN-Standard-A", "cmn-CN-Standard-B", "cmn-CN-Standard-C", "cmn-CN-Standard-D"] },
    "de-DE": { name: "독일어", voices: ["de-DE-Standard-A", "de-DE-Standard-B"] }
};

// --- 전역 변수 선언 ---
let currentFolderPath = null;
let currentWords = [];
let folders = {};
let wordHidden = {};
let meaningHidden = {};
let ttsAudio = new Audio();
let currentWordLanguage = 'en-US';
let currentMeaningLanguage = 'ko-KR';
let currentWordVoice = 'en-US-Standard-A';
let currentMeaningVoice = 'ko-KR-Standard-A';
let currentFontSize = 14;
let autoPlayTimeoutId = null; let autoPlayMode = 'both'; let autoPlayCurrentIndex = 0; let autoPlayStartIndex = 0; let autoPlayEndIndex = 0; let autoPlayRepeats = 1; let autoPlayCurrentRepeat = 0; let isAutoPlaying = false; let isAutoPaused = false;
let autoPlayWords = [];

let isResizing = false; let resizeTimeout; let startX, startWidthLeft, startWidthRight, colLeft, colRight, colLeftIndex, columnResizingActive = false;
let longPressTimer = null;
const LONG_PRESS_DURATION = 500;
let touchStartX, touchStartY;
let isDragging = false;
let isInSelectionMode = false;

let folderLongPressTimer = null;
let folderTouchStartX, folderTouchStartY;
let isFolderDragging = false;
let folderSelectCallback = null;

let isCardViewActive = false;
let currentCardIndex = 0;
let isCardFlipped = false;
let cardRange = {
    startIndex: 0,
    endIndex: -1,
    filteredWords: [],
    originalIndices: []
};

let isFrontTtsEnabled = true;
let isBackTtsEnabled = true;

let isExamModeActive = false;
let currentExamType = null;
let examWords = [];
let currentExamIndex = 0;
let examScore = 0;
let totalExamItems = 0;
let selectedAnswerIndex = -1;
let currentCorrectIndex = -1;
let selectedMatchItem1 = null;
let selectedMatchItem2 = null;
let matchingPairsData = [];
let correctMatches = 0;
let totalCorrectMatches = 0;
const MATCHING_SET_SIZE = 5;
let currentMatchingSet = 1;
let totalMatchingSets = 1;
let currentExamItems = [];

let currentSentenceViewIndex = 0;
let currentKnowledgeFilter = 'all';
let isSentenceModeActive = false;

const availableDefaultWordlists = {
    "beginner_english_500": "초급 영어 500",
    "toeic_essential_1000": "토익 필수 1000",
    "travel_phrases_jp": "여행 일본어 회화"
};

// --- DOM 로드 시 실행 ---
document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM 로드 완료, 초기화 시작");
    generateLanguageMenu();
    loadFoldersAndSelectInitial();
    setupAccordionMenus(); // 아코디언 메뉴 설정은 먼저 호출
    populateDefaultWordlistMenu();
    setupDropdownEventListeners();

    const flashcardElement = document.getElementById('flashcard');
    if (flashcardElement) {
        flashcardElement.addEventListener('click', function(event) {
            if (event.target.closest('.tts-toggle-icon')) {
                return;
            }
            const rect = flashcardElement.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const navAreaWidthRatio = 0.3;
            if (clickX < rect.width * navAreaWidthRatio) {
                showPrevCard();
            } else if (clickX > rect.width * (1 - navAreaWidthRatio)) {
                showNextCard();
            } else {
                flipCard();
            }
        });
    } else {
        console.warn("플래시 카드 요소를 찾을 수 없습니다 (#flashcard).");
    }

    // 드롭다운 위치 조정 로직 (주석 처리된 기존 로직 유지)
    function adjustDropdownMenuPosition(buttonElement) {
        const dropdownContent = buttonElement.nextElementSibling;
        if (!dropdownContent || !dropdownContent.classList.contains('dropdown-content')) {
            return;
        }
        dropdownContent.style.left = '0';
        dropdownContent.style.right = 'auto';
        const rect = dropdownContent.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        if (rect.right > viewportWidth - 10) {
            dropdownContent.style.left = 'auto';
            dropdownContent.style.right = '0';
        } else {
            dropdownContent.style.left = '0';
            dropdownContent.style.right = 'auto';
        }
    }

    // 적용할 드롭다운 버튼들 (파일, 폴더, 시험, 더보기 등)
    // #more-menu-dropdown .dropbtn, #tts-menu-dropdown .dropbtn 도 필요하면 추가
    const dropdownButtonsToAdjustQuery = '.dropdown > .dropbtn';
    document.querySelectorAll(dropdownButtonsToAdjustQuery).forEach(button => {
        const dropdownContainer = button.parentElement;
        if (dropdownContainer) {
            dropdownContainer.addEventListener('mouseenter', () => {
                requestAnimationFrame(() => {
                    const content = dropdownContainer.querySelector('.dropdown-content');
                    if(content && window.getComputedStyle(content).display === 'block'){
                        adjustDropdownMenuPosition(button);
                    }
                });
            });
            button.addEventListener('focusin', () => {
                 requestAnimationFrame(() => {
                    const content = dropdownContainer.querySelector('.dropdown-content');
                    if(content && window.getComputedStyle(content).display === 'block'){
                        adjustDropdownMenuPosition(button);
                    }
                });
            });
            button.addEventListener('click', (e) => {
                 requestAnimationFrame(() => {
                    const content = dropdownContainer.querySelector('.dropdown-content');
                     if(content && window.getComputedStyle(content).display === 'block'){
                        adjustDropdownMenuPosition(button);
                    }
                });
            });
        }
    });


    const fileUpload = document.getElementById('file-upload');
    if (fileUpload) fileUpload.addEventListener('change', handleFileUpload);
    const backupFileInput = document.getElementById('backup-file-input');
    if (backupFileInput) backupFileInput.addEventListener('change', handleBackupFileLoad);

    document.body.classList.remove('sidebar-open');
    const sidebar = document.getElementById('folderSidebar');
    if(sidebar) sidebar.classList.remove('open');

    window.addEventListener('resize', () => { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(setupColumnResizing, 150); });
    setupContextMenuListeners();

    const sentenceBtn = document.getElementById('btn-toggle-sentence-view');
    if (sentenceBtn) sentenceBtn.addEventListener('click', toggleSentenceMode);
    else console.warn("Sentence view toggle button (#btn-toggle-sentence-view) not found.");

    const btnMoveSelected = document.getElementById('btn-move-selected');
    if (btnMoveSelected) btnMoveSelected.addEventListener('click', triggerMoveSelectedWords);

    const sentenceListContainerForScroll = document.getElementById('sentence-list-container');
    if (sentenceListContainerForScroll) {
        let scrollTimeout;
        sentenceListContainerForScroll.addEventListener('scroll', function() {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(function() {
                let closestEntry = null;
                let smallestDistance = Infinity;
                const containerRect = sentenceListContainerForScroll.getBoundingClientRect();
                sentenceListContainerForScroll.querySelectorAll('.sentence-entry').forEach(entry => {
                    const entryRect = entry.getBoundingClientRect();
                    const distance = Math.abs(entryRect.top - containerRect.top);
                    if (entryRect.bottom > containerRect.top && entryRect.top < containerRect.bottom) {
                        if (distance < smallestDistance) {
                            smallestDistance = distance;
                            closestEntry = entry;
                        }
                    }
                });
                if (closestEntry && closestEntry.dataset.displayIndex) {
                    const newIndex = parseInt(closestEntry.dataset.displayIndex, 10);
                    if (newIndex !== currentSentenceViewIndex) {
                        currentSentenceViewIndex = newIndex;
                        updateSentenceCounter();
                    }
                }
            }, 150);
        });
    }
    console.log("초기화 완료");
});


function setupDropdownEventListeners() {
    const dropdowns = document.querySelectorAll('.dropdown');
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent); // 간단한 모바일 감지

    dropdowns.forEach(dropdown => {
        const button = dropdown.querySelector('.dropbtn');
        const content = dropdown.querySelector('.dropdown-content');

        if (button && content) {
            const eventType = isMobile ? 'touchend' : 'click'; // 모바일이면 touchend, 아니면 click

            button.addEventListener(eventType, function (event) {
                event.preventDefault(); // 기본 동작 방지 (특히 touchend 시 중요할 수 있음)
                event.stopPropagation();

                // 다른 드롭다운 닫기 (기존 로직 유지)
                document.querySelectorAll('.dropdown-content').forEach(otherContent => {
                    if (otherContent !== content && (otherContent.style.display === 'block' || window.getComputedStyle(otherContent).display === 'block')) {
                        otherContent.style.display = 'none';
                        const otherButton = otherContent.previousElementSibling;
                        if (otherButton && typeof otherButton.blur === 'function') {
                            otherButton.blur();
                        }
                    }
                });

                // 현재 드롭다운 토글 (기존 로직 유지)
                const isCurrentlyOpen = content.style.display === 'block' || window.getComputedStyle(content).display === 'block';
                if (isCurrentlyOpen) {
                    content.style.display = 'none';
                    if (typeof button.blur === 'function') button.blur();
                } else {
                    content.style.display = 'block';
                    // adjustDropdownMenuPosition(button);
                }
            });
        }
    });

    // 문서 전체 이벤트 리스너 (모바일/PC 공통 또는 분리)
    const documentEventType = isMobile ? 'touchend' : 'click';
    document.addEventListener(documentEventType, function (event) {
        // 드롭다운 외부 클릭/터치 시 모든 드롭다운 닫기
        let clickedInsideADropdown = false;
        dropdowns.forEach(dropdown => {
            if (dropdown.contains(event.target)) {
                clickedInsideADropdown = true;
            }
        });

        if (!clickedInsideADropdown) { // 드롭다운 외부를 클릭/터치한 경우
            document.querySelectorAll('.dropdown-content').forEach(content => {
                if (content.style.display === 'block' || window.getComputedStyle(content).display === 'block') {
                    content.style.display = 'none';
                    const button = content.closest('.dropdown')?.querySelector('.dropbtn');
                    if (button && typeof button.blur === 'function') {
                        button.blur();
                    }
                }
            });
        }
    });
}

// --- 기본 단어장 메뉴 ---
function populateDefaultWordlistMenu() {
    const menuContent = document.getElementById('default-wordlist-menu');
    if (!menuContent) return;
    menuContent.innerHTML = '';
    if (Object.keys(availableDefaultWordlists).length === 0) {
        menuContent.innerHTML = '<span style="padding: 9px 18px; color: #888; display: block;">사용 가능한 기본 단어장 없음</span>';
        return;
    }
    for (const fileKey in availableDefaultWordlists) {
        const displayName = availableDefaultWordlists[fileKey];
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = displayName;
        link.onclick = (e) => {
            e.preventDefault();
            addDefaultWordlist(fileKey, displayName);
            const dropdown = link.closest('.dropdown-content');
            if(dropdown) dropdown.style.display = 'none'; // 클릭 후 드롭다운 닫기 (아코디언 하위 메뉴에서)
            setTimeout(()=> { if(dropdown) dropdown.style.display = ''; }, 100); // CSS :hover 등으로 다시 열릴 수 있도록
        };
        menuContent.appendChild(link);
    }
}

// --- 나머지 JS 함수들은 이전과 동일하게 유지 ---
// (addDefaultWordlist, resetCurrentFilteredWordsStateAndCloseMenu, ... , handleClickOutsideMenus_Combined 등)
// ... (이전 답변의 나머지 script.js 내용을 여기에 붙여넣으세요) ...
// --- TTS 버튼 상태 업데이트 함수 (새로운 TTS 드롭다운 메뉴에 맞게 수정) ---
function updateAutoPlayButtons() {
    const isPlaying = isAutoPlaying && !isAutoPaused;
    const isPaused = isAutoPlaying && isAutoPaused;

    // 드롭다운 내의 재생 시작 버튼들
    const playWordBtn = document.getElementById('tts-play-word');
    const playMeaningBtn = document.getElementById('tts-play-meaning');
    const playBothBtn = document.getElementById('tts-play-both');

    if (playWordBtn) playWordBtn.style.display = (isPlaying || isPaused) ? 'none' : 'block';
    if (playMeaningBtn) playMeaningBtn.style.display = (isPlaying || isPaused) ? 'none' : 'block';
    if (playBothBtn) playBothBtn.style.display = (isPlaying || isPaused) ? 'none' : 'block';

    // 드롭다운 내의 제어 버튼들
    const pauseBtn = document.getElementById('tts-pause');
    const resumeBtn = document.getElementById('tts-resume');
    const stopBtn = document.getElementById('tts-stop');

    if (pauseBtn) pauseBtn.style.display = isPlaying ? 'block' : 'none';
    if (resumeBtn) resumeBtn.style.display = isPaused ? 'block' : 'none';
    if (stopBtn) stopBtn.style.display = (isPlaying || isPaused) ? 'block' : 'none';

    // 메인 TTS 드롭다운 버튼의 텍스트 변경 (선택적)
    const ttsDropdownButton = document.querySelector('#tts-menu-dropdown .dropbtn');
    if (ttsDropdownButton) {
        if (isPlaying) ttsDropdownButton.textContent = "TTS (재생중)";
        else if (isPaused) ttsDropdownButton.textContent = "TTS (일시중지)";
        else ttsDropdownButton.textContent = "TTS 재생";
    }
}

// startAutoPlay, pauseAutoPlay, resumeAutoPlay, stopAutoPlay 함수는
// 호출될 때 updateAutoPlayButtons()를 내부적으로 호출하므로
// 해당 함수들 자체의 변경은 필요 없습니다.
// script.js 파일 끝부분에 추가되거나, 기존 updateAutoPlayButtons 함수를 대체합니다.


// --- (이전에 제공된 나머지 모든 JavaScript 함수들을 여기에 붙여넣으세요) ---
// --- (기존 함수들은 대부분 수정 없이 그대로 사용될 수 있습니다.) ---
// --- (단, 드롭다운 메뉴를 동적으로 닫아야 하는 경우, 해당 로직 확인 필요) ---

// 예시: applyKnowledgeFilterAndClose 함수 등에서 메뉴 닫는 부분
function applyKnowledgeFilterAndClose(filterType, menuId) {
    applyKnowledgeFilter(filterType);
    const menu = document.getElementById(menuId);
    if (menu) {
        menu.style.display = 'none'; // 명시적으로 닫기
        const button = menu.previousElementSibling;
        if (button && typeof button.blur === 'function') {
            button.blur();
        }
    }
}

function toggleDropdownMenu(menuId) {
    // 이 함수는 간단한 토글용으로, 드롭다운 버튼에 직접 onclick으로 연결되었을 때 사용 가능
    // CSS만으로 제어한다면 불필요
    const menu = document.getElementById(menuId);
    if (menu) {
        menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    }
}


// --- 기본 단어장을 사용자 폴더로 추가하는 함수 ---
async function addDefaultWordlist(fileKey, displayName) {
    console.log(`기본 단어장 '${displayName}' (${fileKey}) 추가 시작...`);
    const defaultJsonPath = `/static/defaults/${fileKey}.json`;
    try {
        const response = await fetch(defaultJsonPath);
        if (!response.ok) { throw new Error(`기본 단어장 파일(${response.status}) 로드 실패: ${defaultJsonPath}`); }
        const defaultWordsData = await response.json(); 
        
        let defaultWordsArray = [];
        if (Array.isArray(defaultWordsData)) { 
            defaultWordsArray = defaultWordsData;
        } else if (typeof defaultWordsData === 'object' && defaultWordsData !== null) {
            
            console.warn(`기본 단어장 '${displayName}' 데이터가 배열이 아닙니다. 형식을 확인하세요.`);
            alert(`'${displayName}' 기본 단어장 내용 형식이 배열이 아닙니다. (단어 객체 배열이어야 함)`); return;

        } else {
            alert(`'${displayName}' 기본 단어장 내용 형식이 잘못되었습니다.`); return;
        }

        console.log(`Fetched ${defaultWordsArray.length} words.`);
        if (!Array.isArray(defaultWordsArray) || defaultWordsArray.length === 0 || !defaultWordsArray.every(w => w && typeof w === 'object' && 'word' in w && 'meaning' in w)) {
             alert(`'${displayName}' 기본 단어장 내용 없거나 형식 오류 (word, meaning 필요).`); return;
        }

        let userFolderName = displayName;
        let counter = 1;
        const checkExistingFolders = (folderDict, targetName) => {
            if (!folderDict || typeof folderDict !== 'object') return false;
            if (targetName in folderDict) return true;
            for(const key in folderDict) {
                 if (folderDict[key] && folderDict[key].children && checkExistingFolders(folderDict[key].children, targetName)) { return true; }
            }
            return false;
        };
        const existingFoldersResponse = await fetch('/api/folders');
        const existingFoldersData = await handleResponse(existingFoldersResponse);
        const currentFrontendFolders = buildFolderDict(existingFoldersData.folders || []);

        while (checkExistingFolders(currentFrontendFolders, userFolderName)) { userFolderName = `${displayName} (${++counter})`; }
        console.log(`사용자 폴더 이름 결정: ${userFolderName}`);

        const createFolderResponse = await fetch('/api/folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_name: userFolderName }), });
        await handleResponse(createFolderResponse);
        console.log("User folder created on server.");

        const wordsToBulkAdd = defaultWordsArray.map(w => ({...w, isStudied: false, knowledgeState: 'unknown'})); // knowledgeState 추가

        const bulkAddResponse = await fetch('/api/words/bulk_add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: userFolderName, words: wordsToBulkAdd }), });
        await handleResponse(bulkAddResponse);
        console.log("Bulk add successful.");

        alert(`'${userFolderName}' 폴더에 기본 단어장을 추가했습니다.`);
        loadFoldersAndSelectInitial();
    } catch (error) {
        console.error("기본 단어장 추가 중 오류:", error);
        handleError(error);
    }
}


function resetCurrentFilteredWordsStateAndCloseMenu(menuId) {
    resetCurrentFilteredWordsState();
    const menu = document.getElementById(menuId);
    if (menu) {
        menu.style.display = 'none'; // 명시적으로 닫기
        const button = menu.previousElementSibling;
        if (button && typeof button.blur === 'function') {
            button.blur();
        }
    }
}

async function resetCurrentFilteredWordsState() {
    if (!currentFolderPath) {
        alert("먼저 폴더를 선택해주세요.");
        return;
    }
    if (currentKnowledgeFilter === 'all') {
        alert("전체 보기 상태에서는 단어 상태를 초기화할 수 없습니다. 특정 필터(앎, 애매함, 모름, 미분류)를 선택해주세요.");
        return;
    }
    let filterNameDisplay = "";
    if (currentKnowledgeFilter === 'known') filterNameDisplay = '앎';
    else if (currentKnowledgeFilter === 'unsure') filterNameDisplay = '애매함';
    else if (currentKnowledgeFilter === 'unknown') filterNameDisplay = '모름';
    else if (currentKnowledgeFilter === 'unclassified') filterNameDisplay = '미분류';
    if (!filterNameDisplay) {
        alert("유효하지 않은 필터 상태입니다.");
        return;
    }
    const targetState = 'unknown'; 
    if (!confirm(`현재 '${filterNameDisplay}' 필터에 해당하는 모든 단어의 상태를 '${targetState === 'unclassified' ? '미분류' : '모름'}'(으)로 초기화하시겠습니까?`)) {
        return;
    }
    try {
        const response = await fetch(`/api/words/bulk_update_state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: currentFolderPath,
                filterState: currentKnowledgeFilter,
                newState: targetState
            })
        });
        const data = await handleResponse(response);
        if (data.words) {
            currentWords = data.words;
        } else {
            currentWords.forEach(word => {
                const wordStateToCheck = word.knowledgeState || 'unclassified';
                if (wordStateToCheck === currentKnowledgeFilter) {
                    word.knowledgeState = targetState;
                }
            });
        }
        alert(`'${filterNameDisplay}' 필터의 단어들 상태가 '${targetState === 'unclassified' ? '미분류' : '모름'}'(으)로 초기화되었습니다.`);
        applyKnowledgeFilter(currentKnowledgeFilter);
    } catch (error) {
        handleError(error);
    }
}

function buildFolderDict(folderList) {
    const folderDict = {};
    function processNode(node, dictRef) {
        if (!node || typeof node !== 'object' || !node.name) return;
        const nodeName = node.name;
        dictRef[nodeName] = { name: nodeName, children: {} };
        if (Array.isArray(node.children) && node.children.length > 0) {
            node.children.forEach(childNode => processNode(childNode, dictRef[nodeName].children));
        }
    }
    if (Array.isArray(folderList)) {
       folderList.forEach(rootNode => processNode(rootNode, folderDict));
    }
    return folderDict;
}


function loadFoldersAndSelectInitial() {
    console.log("[JS] loadFoldersAndSelectInitial (Firebase 버전) 시작");

    // Firestore의 'folders' 컬렉션에서 모든 문서를 가져옵니다.
    db.collection('folders').get().then(snapshot => {
        let userFoldersFromDB = [];
        snapshot.forEach(doc => {
            // 문서 데이터와 문서 ID(폴더 경로로 사용)를 합칩니다.
            const folderData = doc.data();
            folderData.path = doc.id; 
            userFoldersFromDB.push(folderData);
        });

        console.log("[JS] Firestore에서 폴더 " + userFoldersFromDB.length + "개 로드 완료");
        folders = userFoldersFromDB; // 전역 변수에 할당

        renderFolderTree(folders); // 가져온 데이터로 폴더 트리 UI를 그립니다.

        // 앱 처음 실행 시 어떤 폴더를 선택할지 결정하는 로직 (기존과 동일)
        let pathToSelect = null;
        const reviewNode = findFolderNode(folders, "복습 절실");
        if (reviewNode) {
            pathToSelect = getFolderPathRecursive(folders, reviewNode.name);
        }
        if (!pathToSelect && folders && folders.length > 0) {
            pathToSelect = getFirstValidPath(folders);
        }

        if (pathToSelect) {
            selectFolder(pathToSelect); // 선택된 폴더의 내용을 불러옵니다.
        } else {
            // 폴더가 하나도 없을 경우 UI를 비웁니다.
            renderWordList();
            renderSentenceView();
        }

    }).catch(error => {
        console.error("[JS][오류] Firestore에서 폴더 목록 가져오기 실패:", error);
        handleError(new Error("데이터베이스에서 폴더 목록을 가져오는 데 실패했습니다. 인터넷 연결을 확인해주세요."));
        folders = [];
        renderFolderTree([]); 
        renderWordList(); 
        renderSentenceView();
    });
}

function findFolderNode(nodes, nameToFind) { if (!Array.isArray(nodes)) return null; for (const n of nodes) { if (n.name === nameToFind) return n; if (n.children) { const f = findFolderNode(n.children, nameToFind); if (f) return f; } } return null; }
function getFolderPathRecursive(nodes, nameToFind, currentPath = '') { if (!Array.isArray(nodes)) return null; for (const n of nodes) { const p = currentPath ? `${currentPath}/${n.name}` : n.name; if (n.name === nameToFind) return p; if (n.children) { const fp = getFolderPathRecursive(n.children, nameToFind, p); if (fp) return fp; } } return null; }
function getFirstValidPath(folderNodes) { if (!folderNodes || folderNodes.length === 0) return null; return folderNodes[0].name; }
function toggleSidebar() { const s = document.getElementById('folderSidebar'), b = document.body; if (s && b) { const o = s.classList.toggle('open'); b.classList.toggle('sidebar-open', o); if (o) { document.addEventListener('click', closeSidebarOnClickOutside, true); } else { document.removeEventListener('click', closeSidebarOnClickOutside, true); } } }
function closeSidebarOnClickOutside(event) { const s = document.getElementById('folderSidebar'); const h = document.querySelector('.hamburger-btn'); if (s && s.classList.contains('open') && !s.contains(event.target) && event.target !== h && !h?.contains(event.target)) { toggleSidebar(); } }
function renderFolderTree(folderNodes, parentElement = null, currentPath = '') { const treeContainer = parentElement || document.querySelector('#folderSidebar #folder-list'); if (!treeContainer) return; if (!parentElement) { treeContainer.innerHTML = ''; if (!Array.isArray(folderNodes) || folderNodes.length === 0) { treeContainer.innerHTML = '<li style="color:#888;list-style-type:none;padding-left:5px;">폴더 없음</li>'; return; } } const ul = parentElement ? parentElement.appendChild(document.createElement('ul')) : treeContainer; ul.style.paddingLeft = parentElement ? '15px' : '0'; ul.style.listStyleType = 'none'; if (Array.isArray(folderNodes)) { folderNodes.forEach(node => { if (!node || typeof node !== 'object' || !node.name) return; const li = document.createElement('li'); const path = currentPath ? `${currentPath}/${node.name}` : node.name; const hasChildren = Array.isArray(node.children) && node.children.length > 0; const iconSpan = document.createElement('span'); iconSpan.classList.add('toggle-icon'); if (hasChildren) { iconSpan.textContent = '▶'; iconSpan.onclick = (e) => toggleFolder(e, iconSpan); } else { iconSpan.style.display = 'inline-block'; iconSpan.style.width = '15px'; } const nameSpan = document.createElement('span'); nameSpan.classList.add('folder-name'); nameSpan.textContent = node.name; nameSpan.onclick = () => selectFolder(path); li.appendChild(iconSpan); li.appendChild(nameSpan); li.dataset.folderPath = path; li.classList.add('folder-item'); if (path === currentFolderPath) { li.classList.add('selected'); } ul.appendChild(li); if (hasChildren) { const childUl = renderFolderTree(node.children, li, path); if (childUl) childUl.style.display = 'none'; } }); } return ul; }

// 기존 createFolder 함수를 지우고 아래 코드로 교체하세요.
function createFolder() {
    const folderNameInput = prompt('새 폴더 이름:');
    if (!folderNameInput || !folderNameInput.trim()) {
        return;
    }
    const newFolderName = folderNameInput.trim();

    if (newFolderName.includes('/')) {
        alert("폴더 이름에는 '/'를 사용할 수 없습니다.");
        return;
    }
    // 이미 존재하는 폴더인지 확인 (로컬 'folders' 배열 기준)
    if (folders.some(f => f.path === newFolderName)) {
        alert('이미 존재하는 폴더 이름입니다.');
        return;
    }

    // Firestore에 새 폴더 문서(Document)를 생성합니다.
    // 문서 ID를 폴더 이름(경로)으로 지정합니다.
    const newFolderData = {
        name: newFolderName,
        path: newFolderName,
        words: [],
        original_words: [],
        is_shuffled: false,
        isDefault: false,
        children: {} // 향후 하위 폴더를 위해 빈 객체로 초기화
    };

    db.collection('folders').doc(newFolderName).set(newFolderData).then(() => {
        console.log(`Firestore에 새 폴더 '${newFolderName}' 생성 완료.`);
        // 성공적으로 생성 후, 전체 폴더 목록을 다시 불러옵니다.
        loadFoldersAndSelectInitial();
    }).catch(error => {
        console.error("Firestore 폴더 생성 오류: ", error);
        handleError(new Error("새 폴더를 만드는 데 실패했습니다."));
    });
}

function createSubfolder() { if (!currentFolderPath) { alert('상위 폴더 선택 필요'); return; } const n = prompt(`'${currentFolderPath}' 아래 하위 폴더 이름:`); if (n && n.trim()) { fetch('/api/folder/sub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parent_path: currentFolderPath, subfolder_name: n.trim() }), }).then(handleResponse).then(d => { folders = d.folders; renderFolderTree(folders); }).catch(handleError); } }
function renameFolder() { if (!currentFolderPath) { alert('변경할 폴더 선택 필요'); return; } const c = currentFolderPath.split('/').pop(); const n = prompt(`'${c}' 새 이름:`, c); if (n && n.trim() && n.trim() !== c) { fetch('/api/folder/rename', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_path: currentFolderPath, new_name: n.trim() }), }).then(handleResponse).then(d => { folders = d.folders; const p = currentFolderPath.split('/'); p[p.length - 1] = n.trim(); const np = p.join('/'); currentFolderPath = np; renderFolderTree(folders); selectFolder(np); }).catch(handleError); } }
function deleteSelectedFolder() { if (!currentFolderPath) { alert('삭제할 폴더 선택 필요'); return; } const fn = currentFolderPath.split('/').pop(); if (confirm(`'${fn}' 폴더와 하위 내용 모두 삭제?`)) { fetch(`/api/folder`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_path: currentFolderPath }), }).then(handleResponse).then(d => { folders = d.folders; currentFolderPath = null; currentWords = []; renderFolderTree(folders); renderWordList(); renderSentenceView(); if (folders && folders.length > 0) { const fp = getFirstValidPath(folders); if (fp) selectFolder(fp); } }).catch(handleError); } }
function collapseSiblingFolders(folderPath) { if (!folderPath) return; const l = folderPath.lastIndexOf('/'); const p = l === -1 ? '' : folderPath.substring(0, l); const fl = document.getElementById('folder-list'); if (!fl) return; let pi; let ss; if (p === '') { pi = fl; ss = ':scope > li.folder-item'; } else { pi = fl.querySelector(`.folder-item[data-folder-path="${p}"]`); ss = ':scope > ul > li.folder-item'; } if (!pi) return; pi.querySelectorAll(ss).forEach(item => { const cu = item.querySelector('ul'); const ti = item.querySelector('.toggle-icon'); if (cu && cu.style.display === 'block' && item.dataset.folderPath !== folderPath) { cu.style.display = 'none'; if (ti) ti.textContent = '▶'; } }); }
function expandParentFolders(folderPath) { if (!folderPath) return; const pp = folderPath.split('/'); let cp = ''; const fl = document.getElementById('folder-list'); if (!fl) return; pp.forEach((part) => { cp = cp ? `${cp}/${part}` : part; const fi = fl.querySelector(`.folder-item[data-folder-path="${cp}"]`); if (fi) { const cu = fi.querySelector('ul'); const ti = fi.querySelector('.toggle-icon'); if (cu && cu.style.display !== 'block') { cu.style.display = 'block'; if (ti) ti.textContent = '▼'; } } }); }
function toggleFolder(event, iconElement) { event.stopPropagation(); const cu = iconElement.parentElement.querySelector('ul'); const fi = iconElement.closest('.folder-item'); const fp = fi.dataset.folderPath; if (cu) { const ih = cu.style.display === 'none'; if (ih) { collapseSiblingFolders(fp); cu.style.display = 'block'; iconElement.textContent = '▼'; } else { cu.style.display = 'none'; iconElement.textContent = '▶'; } } }


function selectFolder(folderPath) {
    console.log(`[Select Folder] Selecting folder: ${folderPath}`);
    currentFolderPath = folderPath;
    
    // UI 업데이트 로직 (기존과 동일)
    collapseSiblingFolders(folderPath);
    currentKnowledgeFilter = 'all'; 
    applyKnowledgeFilter('all');    
    document.querySelectorAll('#folderSidebar .folder-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.folderPath === folderPath);
    });
    expandParentFolders(folderPath);

    if (isCardViewActive) toggleCardView();
    if (isExamModeActive) exitExam();
    if (isSentenceModeActive) toggleSentenceMode();
    if (isInSelectionMode) cancelSelectionMode();

    // ★★★ 핵심 변경점: fetch 대신 전역 'folders' 배열에서 데이터 찾기 ★★★
    const selectedFolderObject = findFolderNodeByPath(folders, folderPath); // 새 헬퍼 함수

    if (selectedFolderObject && Array.isArray(selectedFolderObject.words)) {
        currentWords = JSON.parse(JSON.stringify(selectedFolderObject.words)); // 깊은 복사
    } else {
        console.warn(`[Select Folder] 폴더 '${folderPath}'를 찾지 못했거나 words가 배열이 아닙니다.`);
        currentWords = [];
    }
    
    wordHidden = {};
    meaningHidden = {};
    renderWordList(); // 단어 목록 뷰를 다시 그립니다.
            
    // 사이드바가 열려있으면 닫기
    const sidebar = document.getElementById('folderSidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

// selectFolder를 돕는 새 헬퍼 함수입니다. script.js의 다른 함수들 근처에 추가해주세요.
function findFolderNodeByPath(nodesArray, pathString) {
    if (!pathString || !Array.isArray(nodesArray)) return null;

    function search(nodes, targetPath) {
        for (const node of nodes) {
            if (node.path === targetPath) {
                return node;
            }
            // 참고: 현재 데이터 구조는 children을 사용하지 않으므로 재귀가 필요 없지만,
            // 향후 확장을 위해 남겨둘 수 있습니다. 지금은 최상위 레벨만 찾습니다.
        }
        return null;
    }
    return search(nodesArray, pathString);
}

async function setKnowledgeState(newState) {
    if (!isCardViewActive || !cardRange || !cardRange.filteredWords || currentCardIndex < 0 || currentCardIndex >= cardRange.filteredWords.length) {
        console.warn("setKnowledgeState: 카드 뷰가 아니거나 유효하지 않은 카드 인덱스입니다.");
        return;
    }
    if (!currentFolderPath) {
        alert("현재 폴더 정보가 없습니다.");
        return;
    }
    const currentFilteredWordEntry = cardRange.filteredWords[currentCardIndex];
    const originalWordIndex = cardRange.originalIndices[currentCardIndex];
    if (originalWordIndex === undefined || originalWordIndex < 0 || originalWordIndex >= currentWords.length) {
        console.error("setKnowledgeState: 원본 단어 인덱스를 찾을 수 없습니다.");
        alert("오류: 단어 상태를 업데이트할 수 없습니다.");
        return;
    }
    try {
        const response = await fetch(`/api/words/${originalWordIndex}/knowledge_state`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: currentFolderPath, 
                knowledgeState: newState
            })
        });
        const data = await handleResponse(response); 
        currentWords[originalWordIndex].knowledgeState = newState;
        currentFilteredWordEntry.knowledgeState = newState;
        document.querySelectorAll('.knowledge-state-controls .ks-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.state === newState) {
                btn.classList.add('active');
            }
        });
        const cardElement = document.getElementById('flashcard');
        if (cardElement) {
            cardElement.classList.remove('state-known', 'state-unsure', 'state-unknown', 'state-unclassified');
            cardElement.classList.add(`state-${newState || 'unclassified'}`);
        }
        if (currentKnowledgeFilter !== 'all' && newState !== currentKnowledgeFilter && (newState || 'unclassified') !== currentKnowledgeFilter ) {
            console.log(`상태 변경(${newState})으로 인해 현재 '${currentKnowledgeFilter}' 필터에서 해당 카드가 제외됩니다.`);
            cardRange.filteredWords.splice(currentCardIndex, 1);
            cardRange.originalIndices.splice(currentCardIndex, 1);
            cardRange.endIndex = cardRange.filteredWords.length - 1;
            if (cardRange.filteredWords.length === 0) {
                let filterNameDisplay = '전체';
                if (currentKnowledgeFilter === 'known') filterNameDisplay = '앎';
                else if (currentKnowledgeFilter === 'unsure') filterNameDisplay = '애매함';
                else if (currentKnowledgeFilter === 'unknown') filterNameDisplay = '모름';
                else if (currentKnowledgeFilter === 'unclassified') filterNameDisplay = '미분류';
                alert(`현재 학습 필터 '${filterNameDisplay}'에 더 이상 카드가 없습니다. 목록 보기로 돌아갑니다.`);
                if (isCardViewActive) toggleCardView();
                return;
            } else {
                if (currentCardIndex > cardRange.endIndex) { 
                    currentCardIndex = cardRange.endIndex;
                }
                showCard(currentCardIndex); 
            }
        }
    } catch (error) {
        handleError(error); 
    }
}

function toggleCardView() {
    const w = document.getElementById('wordListMain');
    const f = document.getElementById('flashcardView');
    const s = document.getElementById('sentenceView'); 
    const ex = document.getElementById('examView');   
    if (!w || !f || !s || !ex) {
        console.error("하나 이상의 뷰 요소를 찾을 수 없습니다.");
        return;
    }
    isCardViewActive = !isCardViewActive;
    if (isCardViewActive) {
        if (isSentenceModeActive) isSentenceModeActive = false;
        if (isExamModeActive) isExamModeActive = false; 
        stopAutoPlay(); 
        w.style.display = 'none';
        s.style.display = 'none';
        ex.style.display = 'none';
        f.style.display = 'flex';
        document.body.classList.remove('sentence-mode-active', 'exam-mode-active');
        document.body.classList.add('card-view-active');
        isFrontTtsEnabled = true;
        isBackTtsEnabled = true;
        const newCardRange = getCardRangeParams();
        if (!newCardRange) { 
            let filterNameDisplay = '전체';
            if (currentKnowledgeFilter === 'known') filterNameDisplay = '앎';
            else if (currentKnowledgeFilter === 'unsure') filterNameDisplay = '애매함';
            else if (currentKnowledgeFilter === 'unknown') filterNameDisplay = '모름';
            alert(`선택된 학습 필터 '${filterNameDisplay}'에 해당하는 카드가 없습니다.`);
            toggleCardView(); 
            return;
        }
        cardRange = newCardRange; 
        setTimeout(() => {
            if (!isCardViewActive) return; 
            currentCardIndex = cardRange.startIndex; 
            isCardFlipped = false;
            showCard(currentCardIndex);
        }, 0);
    } else { 
        f.style.display = 'none';
        document.body.classList.remove('card-view-active');
        if (isSentenceModeActive) { 
             s.style.display = 'flex';
             document.body.classList.add('sentence-mode-active');
             renderSentenceView(); 
        } else { 
             w.style.display = 'flex';
             document.body.classList.remove('sentence-mode-active'); 
             renderWordList(); 
        }
    }
}

function getCardRangeParams() {
    const s = document.getElementById('startRow');
    const e = document.getElementById('endRow');
    const wordsForCardView = currentWords.filter(wordEntry => {
        if (!wordEntry || typeof wordEntry !== 'object') return false;
        if (currentKnowledgeFilter === 'all') return true;
        const state = wordEntry.knowledgeState || 'unclassified';
        return state === currentKnowledgeFilter;
    });
    const originalIndices = wordsForCardView.map(filteredWord => currentWords.indexOf(filteredWord));
    const totalFilteredWords = wordsForCardView.length;
    if (totalFilteredWords === 0) {
        return null;
    }
    const startInputVal = parseInt(s?.value) || 1;
    let endInputVal = parseInt(e?.value); 
    let startIndexInFiltered = Math.max(0, startInputVal - 1);
    let endIndexInFiltered;
    if (isNaN(endInputVal) || endInputVal <= 0 || endInputVal > totalFilteredWords) {
        endIndexInFiltered = totalFilteredWords - 1;
    } else {
        endIndexInFiltered = endInputVal - 1;
    }
    if (startIndexInFiltered >= totalFilteredWords) {
        startIndexInFiltered = 0;
    }
    if (endIndexInFiltered < startIndexInFiltered) {
        endIndexInFiltered = startIndexInFiltered;
    }
    startIndexInFiltered = Math.min(startIndexInFiltered, totalFilteredWords - 1);
    endIndexInFiltered = Math.min(endIndexInFiltered, totalFilteredWords - 1);
    return {
        startIndex: startIndexInFiltered,      
        endIndex: endIndexInFiltered,        
        filteredWords: wordsForCardView,     
        originalIndices: originalIndices     
    };
}

function showCard(index) { 
    const fc = document.getElementById('flashcard');
    const cf = document.getElementById('cardFront');
    const cb = document.getElementById('cardBack');
    const cc = document.getElementById('cardCounter');
    const pb = document.getElementById('btn-prev-card');
    const nb = document.getElementById('btn-next-card');
    const cfC = cf?.querySelector('.card-content');
    const cbC = cb?.querySelector('.card-content');
    const ftI = cf?.querySelector('.tts-toggle-icon'); 
    const btI = cb?.querySelector('.tts-toggle-icon'); 
    if (!fc || !cf || !cb || !cc || !pb || !nb || !cfC || !cbC || !ftI || !btI) {
        console.error("showCard: 필수 DOM 요소 중 일부를 찾을 수 없습니다.");
        if (isCardViewActive) toggleCardView(); 
        return;
    }
    if (!cardRange || !cardRange.filteredWords || cardRange.filteredWords.length === 0 || index < cardRange.startIndex || index > cardRange.endIndex || index >= cardRange.filteredWords.length) {
        console.warn("showCard: 인덱스 범위 오류 또는 필터링된 단어 없음", index, cardRange);
        if (isCardViewActive && (!cardRange || !cardRange.filteredWords || cardRange.filteredWords.length === 0)) {
            if(isCardViewActive) toggleCardView();
        }
        return;
    }
    const wordEntry = cardRange.filteredWords[index]; 
    if (!wordEntry) {
        console.warn("showCard: wordEntry 없음 (필터링된 목록 기준)", index);
        return;
    }
    cfC.textContent = wordEntry.word || '[단어 없음]';
    cbC.textContent = wordEntry.meaning || '[뜻 없음]';
    ftI.classList.toggle('fa-volume-high', isFrontTtsEnabled);
    ftI.classList.toggle('fa-volume-xmark', !isFrontTtsEnabled);
    ftI.classList.toggle('muted', !isFrontTtsEnabled);
    btI.classList.toggle('fa-volume-high', isBackTtsEnabled);
    btI.classList.toggle('fa-volume-xmark', !isBackTtsEnabled);
    btI.classList.toggle('muted', !isBackTtsEnabled);
    const totalCardsInCurrentRange = cardRange.endIndex - cardRange.startIndex + 1;
    const currentCardNumInCurrentRange = index - cardRange.startIndex + 1;
    cc.textContent = `${currentCardNumInCurrentRange} / ${totalCardsInCurrentRange}`;
    if (fc) {
        fc.classList.remove('flipped'); 
        const currentKnowledgeState = wordEntry.knowledgeState || 'unclassified'; 
        fc.classList.remove('state-known', 'state-unsure', 'state-unknown', 'state-unclassified');
        fc.classList.add(`state-${currentKnowledgeState}`);
    }
    isCardFlipped = false; 
    pb.disabled = (index <= cardRange.startIndex);
    nb.disabled = (index >= cardRange.endIndex);
    document.querySelectorAll('.knowledge-state-controls .ks-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.state === (wordEntry.knowledgeState || 'unclassified')) {
            btn.classList.add('active');
        }
    });
}

function toggleFaceTTS(face, event) { if (!event || !event.target || !event.target.classList.contains('tts-toggle-icon')) return; event.stopPropagation(); const icon = event.target; if (face === 'front') { isFrontTtsEnabled = !isFrontTtsEnabled; icon.classList.toggle('fa-volume-high', isFrontTtsEnabled); icon.classList.toggle('fa-volume-xmark', !isFrontTtsEnabled); icon.classList.toggle('muted', !isFrontTtsEnabled); } else if (face === 'back') { isBackTtsEnabled = !isBackTtsEnabled; icon.classList.toggle('fa-volume-high', isBackTtsEnabled); icon.classList.toggle('fa-volume-xmark', !isBackTtsEnabled); icon.classList.toggle('muted', !isBackTtsEnabled); } }

function flipCard() {
    if (!isCardViewActive) return;
    const fc = document.getElementById('flashcard');
    if (!fc) return;
    const shouldPlayFront = !isCardFlipped && isFrontTtsEnabled;
    const shouldPlayBack = isCardFlipped && isBackTtsEnabled;
    if (shouldPlayFront || shouldPlayBack) {
        if (cardRange && cardRange.filteredWords && currentCardIndex >= 0 && currentCardIndex < cardRange.filteredWords.length) {
            const wordEntry = cardRange.filteredWords[currentCardIndex]; 
            if (wordEntry) {
                const rawText = !isCardFlipped ? wordEntry.word : wordEntry.meaning;
                const langToUse = !isCardFlipped ? currentWordLanguage : currentMeaningLanguage;
                const voiceToUse = !isCardFlipped ? currentWordVoice : currentMeaningVoice;
                const textToPlay = rawText ? rawText.replace(/\(.*?\)/g, '').trim() : '';
                if (textToPlay) {
                    playTTS(textToPlay, langToUse, voiceToUse);
                }
            }
        }
    }
    isCardFlipped = !isCardFlipped;
    fc.classList.toggle('flipped', isCardFlipped);
}

function showNextCard() {
    if (cardRange && cardRange.filteredWords && currentCardIndex < cardRange.endIndex && currentCardIndex < cardRange.filteredWords.length - 1) {
        currentCardIndex++;
        showCard(currentCardIndex);
    }
}
function showPrevCard() {
    if (cardRange && cardRange.filteredWords && currentCardIndex > cardRange.startIndex) {
        currentCardIndex--;
        showCard(currentCardIndex);
    }
}

function renderWordList() {
    const tableBody = document.querySelector('#word-table-body tbody');
    if (!tableBody) {
        console.error("renderWordList: #word-table-body tbody 요소를 찾을 수 없습니다.");
        return;
    }
    tableBody.innerHTML = ''; 
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
    const wordsToDisplay = currentWords.filter(wordEntry => {
        if (!wordEntry || typeof wordEntry !== 'object') return false;
        if (currentKnowledgeFilter === 'all') return true;
        const state = wordEntry.knowledgeState || 'unclassified';
        return state === currentKnowledgeFilter;
    });
    if (!wordsToDisplay || wordsToDisplay.length === 0) {
        const row = tableBody.insertRow();
        const cell = row.insertCell(0);
        cell.colSpan = 3; 
        let emptyMessage = '표시할 단어가 없습니다.';
        if (currentKnowledgeFilter !== 'all') {
            let filterName = currentKnowledgeFilter;
            if (currentKnowledgeFilter === 'known') filterName = '앎';
            else if (currentKnowledgeFilter === 'unsure') filterName = '애매함';
            else if (currentKnowledgeFilter === 'unknown') filterName = '모름';
            else if (currentKnowledgeFilter === 'unclassified') filterName = '미분류';
            emptyMessage = `선택된 학습 필터 '${filterName}'에 해당하는 단어가 없습니다.`;
        }
        cell.textContent = emptyMessage;
        cell.style.textAlign = 'center';
        cell.style.padding = '20px';
        setupColumnResizing();
        return;
    }
    wordsToDisplay.forEach((wordEntry, displayIndex) => { 
        const originalIndex = currentWords.indexOf(wordEntry); 
        if (originalIndex === -1) {
            console.warn("renderWordList: 필터링된 항목이 currentWords에 없습니다.", wordEntry);
            return;
        }
        const row = tableBody.insertRow();
        row.dataset.index = originalIndex; 
        row.classList.remove('state-known', 'state-unsure', 'state-unknown', 'state-unclassified', 'studied-word');
        const stateClass = `state-${wordEntry.knowledgeState || 'unclassified'}`;
        row.classList.add(stateClass);
        if (wordEntry.isStudied) {
            row.classList.add('studied-word');
        }
        const numberCell = row.insertCell(0);
        const wordCell = row.insertCell(1);
        const meaningCell = row.insertCell(2);
        numberCell.classList.add('col-number');
        wordCell.classList.add('col-word');
        meaningCell.classList.add('col-meaning');
        const tableRowNumberForDisplay = displayIndex + 1; 
        if (isInSelectionMode) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.classList.add('word-row-checkbox');
            checkbox.value = originalIndex;
            checkbox.onclick = handleRowCheckboxClick;
            numberCell.appendChild(checkbox);
            numberCell.appendChild(document.createTextNode(String(tableRowNumberForDisplay))); 
            const toggleCurrentCheckbox = () => { checkbox.checked = !checkbox.checked; handleRowCheckboxClick({ target: checkbox }); };
            numberCell.onclick = (event) => { if (event.target !== checkbox) toggleCurrentCheckbox(); };
            wordCell.onclick = toggleCurrentCheckbox;
            meaningCell.onclick = toggleCurrentCheckbox;
        } else {
            numberCell.textContent = tableRowNumberForDisplay; 
            numberCell.onclick = () => playTTSSequence(wordEntry.word, wordEntry.meaning);
            wordCell.onclick = () => {
                toggleWordHidden(originalIndex);
                const textToPlay = wordEntry.word ? wordEntry.word.replace(/\(.*?\)/g, '').trim() : '';
                playTTS(textToPlay, currentWordLanguage, currentWordVoice);
            };
            meaningCell.onclick = () => {
                toggleMeaningHidden(originalIndex);
                const textToPlay = wordEntry.meaning ? wordEntry.meaning.replace(/\(.*?\)/g, '').trim() : '';
                playTTS(textToPlay, currentMeaningLanguage, currentMeaningVoice);
            };
        }
        wordCell.textContent = wordHidden[originalIndex] ? '********' : (wordEntry.word || '');
        meaningCell.textContent = meaningHidden[originalIndex] ? '********' : (wordEntry.meaning || '');
    });
    setupColumnResizing();
}


function updateSentenceCounter() {
    const counterElement = document.getElementById('sentenceCounter');
    const displayableEntries = currentWords ? currentWords.filter(w => {
        if (!w || typeof w !== 'object' || !Array.isArray(w.entries) || w.entries.length === 0) return false;
        if (currentKnowledgeFilter === 'all') return true;
        const state = w.knowledgeState || 'unclassified';
        return state === currentKnowledgeFilter;
    }) : [];
    const totalDisplayableItems = displayableEntries.length;
    if (counterElement) {
        if (totalDisplayableItems > 0) {
            const currentDisplayNum = Math.min(Math.max(1, currentSentenceViewIndex + 1), totalDisplayableItems);
            counterElement.textContent = `${currentDisplayNum} / ${totalDisplayableItems}`;
        } else {
            counterElement.textContent = `0 / 0`;
        }
    }
}

function renderSentenceView() {
    const container = document.getElementById('sentence-list-container');
    if (!container) {
        console.warn("Sentence list container not found.");
        updateSentenceCounter(); 
        return;
    }
    container.innerHTML = ''; 
    const wordsToDisplayInSentenceView = currentWords.filter(wordEntry => {
        if (!wordEntry || typeof wordEntry !== 'object') return false;
        if (!Array.isArray(wordEntry.entries) || wordEntry.entries.length === 0) return false;
        if (currentKnowledgeFilter === 'all') {
            return true;
        }
        const state = wordEntry.knowledgeState || 'unclassified';
        return state === currentKnowledgeFilter;
    });
    let displayableItemIndex = -1; 
    let sentenceEntryRendered = false;
    if (wordsToDisplayInSentenceView && wordsToDisplayInSentenceView.length > 0) {
        wordsToDisplayInSentenceView.forEach((wordEntry) => {
            sentenceEntryRendered = true;
            displayableItemIndex++;
            const entryDiv = document.createElement('div');
            entryDiv.classList.add('sentence-entry');
            const originalIndex = currentWords.indexOf(wordEntry); 
            entryDiv.dataset.originalIndex = originalIndex;
            entryDiv.dataset.displayIndex = displayableItemIndex; 
            if (wordEntry.isStudied) {
                entryDiv.classList.add('studied-word');
            }
            entryDiv.classList.add(`state-${wordEntry.knowledgeState || 'unclassified'}`);
            const headwordDiv = document.createElement('div');
            headwordDiv.classList.add('headword');
            let headwordText = wordEntry.word || '';
            if (wordEntry.part_of_speech) {
                headwordText += ` (${wordEntry.part_of_speech})`;
            }
            headwordDiv.textContent = headwordText;
            headwordDiv.onclick = handleHeadwordClick; 
            entryDiv.appendChild(headwordDiv);
            const detailsContainer = document.createElement('div');
            detailsContainer.classList.add('details-container');
            wordEntry.entries.forEach((item) => {
                if (item && (item.definition || item.example)) {
                    const itemDiv = document.createElement('div');
                    itemDiv.classList.add('entry-item');
                    if (item.definition) {
                        const defP = document.createElement('p');
                        defP.classList.add('definition');
                        defP.textContent = item.definition;
                        itemDiv.appendChild(defP);
                    }
                    if (item.example) {
                        const exP = document.createElement('p');
                        exP.classList.add('example-sentence');
                        exP.textContent = item.example;
                        exP.onclick = handleExampleClick;
                        itemDiv.appendChild(exP);
                        if (item.translation) {
                            const trP = document.createElement('p');
                            trP.classList.add('translation');
                            trP.textContent = item.translation;
                            trP.style.display = 'none';
                            itemDiv.appendChild(trP);
                        }
                    }
                    detailsContainer.appendChild(itemDiv);
                }
            });
            entryDiv.appendChild(detailsContainer);
            container.appendChild(entryDiv);
        });
    }
    if (!sentenceEntryRendered) {
        let emptyMessage = '표시할 문장 정보가 없습니다.';
        if (currentKnowledgeFilter !== 'all') {
            let filterName = currentKnowledgeFilter;
            if (currentKnowledgeFilter === 'known') filterName = '앎';
            else if (currentKnowledgeFilter === 'unsure') filterName = '애매함';
            else if (currentKnowledgeFilter === 'unknown') filterName = '모름';
            else if (currentKnowledgeFilter === 'unclassified') filterName = '미분류';
            emptyMessage = `선택된 학습 필터 '${filterName}'에 해당하는 문장 정보가 없습니다.`;
        }
        container.innerHTML = `<div class="no-words-message" style="text-align:center; padding:20px;">${emptyMessage}</div>`;
        currentSentenceViewIndex = 0; 
    } else {
         const firstVisibleEntry = container.querySelector('.sentence-entry');
         if (firstVisibleEntry && firstVisibleEntry.dataset.displayIndex !== undefined) {
             currentSentenceViewIndex = parseInt(firstVisibleEntry.dataset.displayIndex, 10);
         } else {
            currentSentenceViewIndex = 0;
         }
    }
    updateSentenceCounter(); 
}

function handleHeadwordClick(event) {
    const headwordDiv = event.target.closest('.headword');
    if (!headwordDiv) return;
    const entryDiv = headwordDiv.closest('.sentence-entry');
    if (!entryDiv) return;
    if (entryDiv.dataset.displayIndex) {
        currentSentenceViewIndex = parseInt(entryDiv.dataset.displayIndex, 10);
        updateSentenceCounter(); 
    }
    const detailsContainer = entryDiv.querySelector('.details-container');
    if (!detailsContainer) return;
    const isOpen = entryDiv.classList.contains('open');
    const rawHeadwordText = headwordDiv.textContent || '';
    const wordToPlay = rawHeadwordText.split('(')[0].trim();
    if (wordToPlay) {
        playTTS(wordToPlay, currentWordLanguage, currentWordVoice);
    }
    document.querySelectorAll('.sentence-entry.open').forEach(openEntry => {
        if (openEntry !== entryDiv) {
            openEntry.classList.remove('open');
            openEntry.querySelectorAll('.translation').forEach(t => t.style.display = 'none');
        }
    });
    entryDiv.classList.toggle('open', !isOpen);
    if (isOpen) {
        detailsContainer.querySelectorAll('.translation').forEach(t => t.style.display = 'none');
    } else {
        setTimeout(() => {
            const headerHeight = document.querySelector('.top-controls')?.offsetHeight || 0;
            const sentenceHeaderHeight = document.querySelector('.sentence-view-header')?.offsetHeight || 0;
            const buffer = 10; 
            const targetScrollPosition = entryDiv.offsetTop - headerHeight - sentenceHeaderHeight - buffer;
            const listContainer = document.getElementById('sentence-list-container');
            if (listContainer) {
                listContainer.scrollTo({ top: targetScrollPosition, behavior: 'smooth' });
            }
        }, 150);
    }
}
function toggleSentenceMode() {
    const wlm = document.getElementById('wordListMain');
    const fv = document.getElementById('flashcardView');
    const ev = document.getElementById('examView');
    const sv = document.getElementById('sentenceView');
    if (!wlm || !fv || !ev || !sv) return;
    isSentenceModeActive = !isSentenceModeActive;
    if (isSentenceModeActive) {
        if (isCardViewActive) isCardViewActive = false;
        if (isExamModeActive) isExamModeActive = false;
        if (isInSelectionMode) cancelSelectionMode();
        stopAutoPlay();
    }
    document.body.classList.toggle('sentence-mode-active', isSentenceModeActive);
    document.body.classList.remove('card-view-active', 'exam-mode-active');
    wlm.style.display = 'none'; fv.style.display = 'none'; ev.style.display = 'none'; sv.style.display = 'none';
    if (isSentenceModeActive) {
        sv.style.display = 'flex';
        renderSentenceView(); 
    } else {
        wlm.style.display = 'flex';
        renderWordList();
    }
}
  
function handleExampleClick(event) {
event.stopPropagation();
const exP = event.target.closest('.example-sentence');
if (!exP) return;
const it = exP.closest('.entry-item');
if (!it) return;
const trP = it.querySelector('.translation');
if (trP) {
    const isHidden = trP.style.display === 'none' || trP.style.display === '';
    trP.style.display = isHidden ? 'block' : 'none';
}
const textToPlay = exP.textContent ? exP.textContent.replace(/\(.*?\)/g, '').trim() : '';
const lang = 'en-US'; 
const voice = voiceOptions[lang]?.voices[0] || 'en-US-Standard-A'; 
if (textToPlay) {
    playTTS(textToPlay, lang, voice);
}
}
function handleRowCheckboxClick(event) { const c = event.target; const r = c.closest('tr'); if (r) { r.classList.toggle('row-selected', c.checked); } updateSelectAllCheckboxState(); }
function updateSelectAllCheckboxState() { const sac = document.getElementById('select-all-checkbox'); if (!sac || !isInSelectionMode) return; const arc = document.querySelectorAll('#word-table-body .word-row-checkbox'); const crc = document.querySelectorAll('#word-table-body .word-row-checkbox:checked'); if (arc.length === 0) { sac.checked = false; sac.indeterminate = false; } else if (crc.length === arc.length) { sac.checked = true; sac.indeterminate = false; } else if (crc.length > 0) { sac.checked = false; sac.indeterminate = true; } else { sac.checked = false; sac.indeterminate = false; } }
function toggleWordHidden(index) { wordHidden[index] = !wordHidden[index]; renderWordList(); }
function toggleMeaningHidden(index) { meaningHidden[index] = !meaningHidden[index]; renderWordList(); }
function playTTSSequence(word, meaning) { const wf = word ? word.replace(/\(.*?\)/g, '').trim() : ''; const mf = meaning ? meaning.replace(/\(.*?\)/g, '').trim() : ''; playTTS(wf, currentWordLanguage, currentWordVoice, () => { setTimeout(() => { playTTS(mf, currentMeaningLanguage, currentMeaningVoice); }, 300); }); }

// 기존 playTTS 함수를 지우고 아래 코드로 교체하세요.
function playTTS(text, languageCode, voiceName, onEndCallback) {
    if (!text || text.trim() === '') {
        if (onEndCallback) try { onEndCallback(); } catch (e) {}
        return;
    }

    if (ttsAudio && !ttsAudio.paused) {
        ttsAudio.pause();
        ttsAudio.onended = null;
        ttsAudio.onerror = null;
        if (ttsAudio.src && ttsAudio.src.startsWith('blob:')) {
            try { URL.revokeObjectURL(ttsAudio.src); } catch (e) {}
        }
    }
    ttsAudio = new Audio();

    // ▼▼▼ 여기에 4단계에서 복사한 본인의 함수 URL을 붙여넣으세요! ▼▼▼
    const ttsFunctionUrl = 'https://generatetts-5ugghm37oa-uc.a.run.app'; 

    fetch(ttsFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: text,
            language_code: languageCode,
            voice_name: voiceName
        }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`TTS 요청 실패 (상태: ${response.status})`);
        }
        return response.blob();
    })
    .then(blob => {
        const audioUrl = URL.createObjectURL(blob);
        ttsAudio.src = audioUrl;
        ttsAudio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            if (onEndCallback) onEndCallback();
        };
        ttsAudio.onerror = (e) => {
            console.error("TTS 재생 오류:", e);
            URL.revokeObjectURL(audioUrl);
            if (isAutoPlaying) stopAutoPlay();
            if (onEndCallback) onEndCallback();
        };
        ttsAudio.play().catch(error => {
            console.error("TTS 재생 시작 오류:", error);
            URL.revokeObjectURL(audioUrl);
            if (isAutoPlaying) stopAutoPlay();
            if (onEndCallback) onEndCallback();
        });
    })
    .catch(error => {
        handleError(error);
        if (isAutoPlaying) stopAutoPlay();
        if (onEndCallback) onEndCallback();
    });
}

function handleFileUpload(event) {
    if (!currentFolderPath) { alert("업로드할 폴더 선택"); return; }
    const f = event.target.files[0];
    if (f) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('path', currentFolderPath);
        fetch(`/api/words/upload_content`, { // 엔드포인트 변경
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, // FormData 대신 JSON
            body: JSON.stringify({
                path: currentFolderPath,
                filename: f.name, // 참고용 파일명
                content: null // 내용은 FileReader로 읽어서 전달
            })
        })
        .then(response => { // 직접 응답 처리 (handleResponse는 JSON 파싱 시도)
            if (!response.ok) {
                return response.json().then(data => { // 오류 응답은 JSON일 수 있음
                    throw new Error(data.error || `서버 응답 오류 (상태: ${response.status})`);
                });
            }
            return response.json(); // 성공 응답은 JSON
        })
        .then(d => {
            currentWords = d.words || [];
            if (isSentenceModeActive) renderSentenceView(); else renderWordList();
            alert(`${f.name} 로드 완료.`);
        })
        .catch(handleError)
        .finally(() => { event.target.value = null; });

        // FileReader로 파일 내용 읽기
        const reader = new FileReader();
        reader.onload = (e_reader) => {
            const fileContent = e_reader.target.result;
            const payload = {
                path: currentFolderPath,
                filename: f.name,
                content: fileContent
            };
            fetch(`/api/words/upload_content`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(handleResponse) // 이제 handleResponse 사용 가능
            .then(d => {
                currentWords = d.words || [];
                if (isSentenceModeActive) renderSentenceView(); else renderWordList();
                alert(`${f.name} 로드 완료.`);
            })
            .catch(handleError)
            .finally(() => { event.target.value = null; });
        };
        reader.onerror = () => {
            alert("파일 읽기 오류");
            event.target.value = null;
        };
        reader.readAsText(f); // 텍스트 파일로 읽기
    }
}


async function addWord() {
    if (!currentFolderPath) {
        alert('단어를 추가할 폴더를 먼저 선택해주세요.');
        return;
    }

    // Firestore에서 현재 폴더 문서를 직접 참조합니다.
    const folderRef = db.collection('folders').doc(currentFolderPath);
    let wordsAddedCount = 0;

    while (true) {
        const wordInput = prompt('단어 (취소 또는 빈 칸 입력 시 추가 종료):');
        if (wordInput === null || wordInput.trim() === '') break;
        
        const meaningInput = prompt(`'${wordInput}'의 뜻 (취소 또는 빈 칸 입력 시 추가 종료):`);
        if (meaningInput === null || meaningInput.trim() === '') break;

        const posInput = prompt(`'${wordInput}'의 품사 (선택사항):`, '');

        const newWordEntry = {
            word: wordInput.trim(),
            meaning: meaningInput.trim(),
            part_of_speech: posInput ? posInput.trim() : null,
            entries: [{ definition: meaningInput.trim(), example: "", translation: "" }],
            isStudied: false,
            knowledgeState: 'unknown'
        };

        try {
            // 'words'와 'original_words' 배열에 새 단어를 추가합니다.
            // FieldValue.arrayUnion을 사용하면 해당 항목이 배열에 없을 때만 추가합니다.
            await folderRef.update({
                words: firebase.firestore.FieldValue.arrayUnion(newWordEntry),
                original_words: firebase.firestore.FieldValue.arrayUnion(newWordEntry)
            });

            // 로컬 데이터에도 즉시 반영하여 UI를 업데이트합니다.
            currentWords.push(newWordEntry);
            if (isSentenceModeActive) {
                renderSentenceView();
            } else {
                renderWordList();
            }
            wordsAddedCount++;
            
            // 맨 아래로 스크롤
            const bw = document.querySelector('.word-table-body-wrapper');
            if(bw) bw.scrollTop = bw.scrollHeight;

        } catch (error) {
            console.error("Firestore에 단어 추가 오류: ", error);
            handleError(new Error("단어를 추가하는 데 실패했습니다."));
            break; // 오류 발생 시 반복 중단
        }
    }
    
    if (wordsAddedCount > 0) {
        console.log(`${wordsAddedCount}개의 단어 추가 완료.`);
    }
}

function editWord(index) {
    if (!currentFolderPath) { alert('수정할 폴더 선택'); return; }
    if (index === undefined || isNaN(index) || index < 0 || index >= currentWords.length) { alert('유효하지 않음'); return; }
    const oldEntry = currentWords[index];
    if (!oldEntry || typeof oldEntry !== 'object') { alert('수정할 항목 데이터 오류'); return; }
    const oldW = oldEntry.word || '';
    const oldM = oldEntry.meaning || '';
    const oldPOS = oldEntry.part_of_speech || '';
    const newW = prompt('단어 수정:', oldW);
    if (newW === null) return;
    const newM = prompt('뜻 수정:', oldM);
    if (newM === null) return;
    const newPOS = prompt('품사 수정 (비우려면 빈 칸):', oldPOS);
    if (newPOS === null) return;
    if ((newW.trim() !== oldW || newM.trim() !== oldM || (newPOS || '').trim() !== oldPOS) && newW.trim() && newM.trim()) {
        const updatedEntryData = {
            word: newW.trim(),
            meaning: newM.trim(),
            part_of_speech: (newPOS || '').trim() || null
        };
        fetch(`/api/words/${index}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ path: currentFolderPath, ...updatedEntryData }),
        })
        .then(handleResponse)
        .then(d => {
            currentWords = d.words;
            if (isSentenceModeActive) renderSentenceView(); else renderWordList();
        })
        .catch(handleError);
    }
}


function deleteWord(index) {
    if (!currentFolderPath) {
        alert('단어를 삭제할 폴더를 선택해주세요.');
        return;
    }
    if (index === undefined || isNaN(index) || index < 0 || index >= currentWords.length) {
        alert('유효하지 않은 단어 인덱스입니다.');
        return;
    }

    const wordEntryToDelete = currentWords[index];
    if (!wordEntryToDelete) {
        alert('삭제할 단어 항목의 데이터가 올바르지 않습니다.');
        return;
    }
    
    if (confirm(`'${wordEntryToDelete.word || '[단어 없음]'}' 항목을 정말 삭제하시겠습니까?`)) {
        const folderRef = db.collection('folders').doc(currentFolderPath);

        // Firestore의 배열에서 특정 항목을 제거합니다.
        folderRef.update({
            words: firebase.firestore.FieldValue.arrayRemove(wordEntryToDelete),
            original_words: firebase.firestore.FieldValue.arrayRemove(wordEntryToDelete)
        }).then(() => {
            console.log("Firestore에서 단어 삭제 완료.");
            // 로컬 데이터에서도 삭제하고 UI를 다시 그립니다.
            currentWords.splice(index, 1);
            if (isSentenceModeActive) {
                renderSentenceView();
            } else {
                renderWordList();
            }
        }).catch(error => {
            console.error("Firestore 단어 삭제 오류:", error);
            handleError(new Error("단어를 삭제하는 데 실패했습니다."));
        });
    }
}

function deleteAllWords() {
    if (!currentFolderPath) {
        alert("삭제할 폴더를 선택해주세요.");
        return;
    }
    const folderName = currentFolderPath.split('/').pop();

    if (confirm(`'${folderName}' 폴더의 모든 단어/문장을 정말 삭제하시겠습니까?`)) {
        const folderRef = db.collection('folders').doc(currentFolderPath);

        // words와 original_words 필드를 빈 배열로 덮어씁니다.
        folderRef.update({
            words: [],
            original_words: [],
            is_shuffled: false
        }).then(() => {
            console.log(`'${folderName}' 폴더의 모든 단어 삭제 완료.`);
            currentWords = [];
            renderWordList();
            renderSentenceView();
            alert(`'${folderName}' 폴더의 모든 항목이 삭제되었습니다.`);
        }).catch(error => {
            console.error("전체 단어 삭제 오류:", error);
            handleError(new Error("전체 단어를 삭제하는 데 실패했습니다."));
        });
    }
}

function applyKnowledgeFilter(filterType) {
    if (!['all', 'known', 'unsure', 'unknown', 'unclassified'].includes(filterType)) {
        console.warn("유효하지 않은 필터 타입:", filterType);
        return;
    }
    const oldFilter = currentKnowledgeFilter; 
    currentKnowledgeFilter = filterType;
    const filterButton = document.getElementById('knowledge-filter-btn');
    if (filterButton) {
        let buttonText = "필터: ";
        if (filterType === 'all') buttonText += "전체";
        else if (filterType === 'known') buttonText += "앎";
        else if (filterType === 'unsure') buttonText += "애매함";
        else if (filterType === 'unknown') buttonText += "모름";
        else if (filterType === 'unclassified') buttonText += "미분류"; 
        filterButton.textContent = buttonText;
    }
    if (isCardViewActive) {
        console.log(`카드 뷰 활성 중 필터 변경: ${oldFilter} -> ${currentKnowledgeFilter}`);
        const f = document.getElementById('flashcardView');
        if (f) f.style.display = 'none';
        document.body.classList.remove('card-view-active');
        const newCardRange = getCardRangeParams(); 
        if (!newCardRange || newCardRange.filteredWords.length === 0) {
            let filterNameDisplay = '전체';
            if (currentKnowledgeFilter === 'known') filterNameDisplay = '앎';
            else if (currentKnowledgeFilter === 'unsure') filterNameDisplay = '애매함';
            else if (currentKnowledgeFilter === 'unknown') filterNameDisplay = '모름';
            else if (currentKnowledgeFilter === 'unclassified') filterNameDisplay = '미분류';
            alert(`선택된 학습 필터 '${filterNameDisplay}'에 해당하는 카드가 없습니다. 목록 보기로 돌아갑니다.`);
            if (isCardViewActive) toggleCardView(); 
            return;
        }
        cardRange = newCardRange; 
        if (f) f.style.display = 'flex';
        document.body.classList.add('card-view-active');
        currentCardIndex = cardRange.startIndex;
        isCardFlipped = false;
        showCard(currentCardIndex); 
    } else if (isSentenceModeActive) {
        renderSentenceView();
    } else {
        renderWordList();
    }
    if (isInSelectionMode) {
        cancelSelectionMode();
    }
}

function swapWordMeaning() {
    if (!currentFolderPath) return;
    if (confirm('단어/뜻 필드 위치 및 TTS 설정 교환? (상세 내용은 변경되지 않음)')) {
        fetch(`/api/words/swap`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: currentFolderPath }) })
        .then(handleResponse)
        .then(d => {
            currentWords = d.words;
            if (isSentenceModeActive) renderSentenceView(); else renderWordList();
            let tl = currentWordLanguage, tv = currentWordVoice;
            currentWordLanguage = currentMeaningLanguage; currentWordVoice = currentMeaningVoice;
            currentMeaningLanguage = tl; currentMeaningVoice = tv;
            updateMenuSelectionVisuals(document.getElementById('language-menu-content'));
        })
        .catch(handleError);
    }
}
function shuffleWords() { if (!currentFolderPath) { alert("섞을 폴더 선택"); return; } fetch(`/api/words/shuffle`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ path: currentFolderPath }) }).then(handleResponse).then(d => { currentWords = d.words; if(isSentenceModeActive) renderSentenceView(); else renderWordList(); }).catch(handleError); }
function restoreWords() { if (!currentFolderPath) { alert("복귀할 폴더 선택"); return; } fetch(`/api/words/restore`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ path: currentFolderPath }) }).then(handleResponse).then(d => { currentWords = d.words; if(isSentenceModeActive) renderSentenceView(); else renderWordList(); }).catch(handleError); }
function restoreOriginalOrder() { restoreWords(); }
function sortWords(key, reverse) { if (!currentFolderPath) { alert("정렬할 폴더 선택"); return; } if (key !== 'word' && key !== 'meaning') return; fetch(`/api/words/sort`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ path: currentFolderPath, key: key, reverse: reverse }) }).then(handleResponse).then(d => { currentWords = d.words; renderWordList(); }).catch(handleError); }
function handleResponse(response) { return response.json().then(data => { if (!response.ok) { throw new Error(data.error || `서버 응답 오류 (상태: ${response.status})`); } return data; }); }
function handleError(error) { console.error("오류 발생:", error); alert(`오류 발생: ${error.message}`); }
function increaseFont() { if (currentFontSize < 24) { currentFontSize++; applyFontSize(); } }
function decreaseFont() { if (currentFontSize > 10) { currentFontSize--; applyFontSize(); } }
function applyFontSize() { const fs = `${currentFontSize}px`; const lh = (currentFontSize * 1.4) + 'px'; const sfs = Math.max(12, currentFontSize - 1) + 'px'; const pb = Math.max(6, currentFontSize * 0.6); const lpb = Math.max(8, currentFontSize * 0.7); const sb = document.getElementById('folderSidebar'); if (sb) { sb.style.fontSize = fs; const h3 = sb.querySelector('h3'); if (h3) h3.style.fontSize = Math.max(14, currentFontSize + 2) + 'px'; } const h = document.getElementById('word-table-header'); const b = document.getElementById('word-table-body'); const sv = document.getElementById('sentenceView'); if (h) { h.querySelectorAll('th').forEach(th => { th.style.fontSize = fs; th.style.padding = `${pb}px ${lpb}px`; }); } if (b) { b.querySelectorAll('td').forEach(td => { td.style.fontSize = fs; td.style.lineHeight = lh; td.style.padding = `${pb}px ${lpb}px`; }); } if (sv) { sv.style.fontSize = fs; sv.querySelectorAll('.headword').forEach(el => el.style.fontSize = (currentFontSize + 2) + 'px'); sv.querySelectorAll('.definition, .example-sentence, .translation').forEach(el => { el.style.fontSize = fs; el.style.lineHeight = lh; }); } const tc = document.querySelector('.top-controls'); if (tc) { tc.querySelectorAll('.dropbtn, .control-btn, .hamburger-btn').forEach(btn => { btn.style.fontSize = sfs; btn.style.padding = `${Math.max(5, currentFontSize * 0.5)}px ${Math.max(10, currentFontSize * 0.7)}px`; }); tc.querySelectorAll('.control-row label').forEach(label => { label.style.fontSize = fs; }); tc.querySelectorAll('.control-input').forEach(input => { input.style.fontSize = fs; input.style.padding = `${Math.max(4, currentFontSize * 0.4)}px`; }); tc.querySelectorAll('.dropdown-content a, .custom-file-upload').forEach(link => { link.style.fontSize = fs; link.style.padding = `${lpb}px ${Math.max(12, currentFontSize * 0.9)}px`; }); const lm = document.getElementById('language-menu-content'); if (lm) { lm.querySelectorAll('.type-link, .lang-link, .voice-link').forEach(link => { link.style.fontSize = fs; }); } } }
function getAutoPlayParams() {
    const startRowInput = document.getElementById('startRow');
    const endRowInput = document.getElementById('endRow');
    const repeatCountInput = document.getElementById('repeatCount');
    const wordsForAutoPlay = currentWords.filter(wordEntry => {
        if (!wordEntry || typeof wordEntry !== 'object') return false;
        if (currentKnowledgeFilter === 'all') return true;
        const state = wordEntry.knowledgeState || 'unclassified';
        return state === currentKnowledgeFilter;
    });
    const totalFilteredWords = wordsForAutoPlay.length;
    if (totalFilteredWords === 0) {
        let filterNameDisplay = '전체';
        if (currentKnowledgeFilter === 'known') filterNameDisplay = '앎';
        else if (currentKnowledgeFilter === 'unsure') filterNameDisplay = '애매함';
        else if (currentKnowledgeFilter === 'unknown') filterNameDisplay = '모름';
        alert(`자동 재생할 단어가 없습니다. (현재 필터: ${filterNameDisplay})`);
        return null;
    }
    const startInputVal = parseInt(startRowInput.value) || 1;
    let endInputVal = parseInt(endRowInput.value); 
    const repeatCountVal = parseInt(repeatCountInput.value) || 1;
    let startIndexInFiltered = Math.max(0, startInputVal - 1);
    let endIndexInFiltered;
    if (isNaN(endInputVal) || endInputVal <= 0 || endInputVal > totalFilteredWords) {
        endIndexInFiltered = totalFilteredWords - 1; 
    } else {
        endIndexInFiltered = endInputVal - 1;
    }
    if (startIndexInFiltered >= totalFilteredWords) {
        alert("시작 행 번호가 현재 필터링된 단어 수를 초과합니다.");
        return null;
    }
    if (endIndexInFiltered < startIndexInFiltered) {
        endIndexInFiltered = startIndexInFiltered;
        if (endRowInput) endRowInput.value = startIndexInFiltered + 1; 
    }
    startIndexInFiltered = Math.min(startIndexInFiltered, totalFilteredWords - 1);
    endIndexInFiltered = Math.min(endIndexInFiltered, totalFilteredWords - 1);
    return {
        startIndex: startIndexInFiltered,       
        endIndex: endIndexInFiltered,         
        repeats: Math.max(1, repeatCountVal),
        filteredWordsForPlay: wordsForAutoPlay  
    };
}
function startAutoPlay(mode) {
    if (isAutoPlaying) stopAutoPlay(); 
    const params = getAutoPlayParams();
    if (!params) return; 
    autoPlayMode = mode;
    autoPlayStartIndex = params.startIndex;
    autoPlayEndIndex = params.endIndex;
    autoPlayRepeats = params.repeats;
    autoPlayWords = params.filteredWordsForPlay; 
    if (autoPlayWords.length === 0) { 
        alert("자동 재생할 단어가 없습니다.");
        return;
    }
    autoPlayCurrentIndex = autoPlayStartIndex; 
    autoPlayCurrentRepeat = 0;
    isAutoPlaying = true;
    isAutoPaused = false;
    updateAutoPlayButtons();
    if (!isSentenceModeActive && !isCardViewActive && !isExamModeActive) { 
        const currentPlayWordEntry = autoPlayWords[autoPlayCurrentIndex];
        const originalIndexToHighlight = currentWords.indexOf(currentPlayWordEntry);
        if (originalIndexToHighlight !== -1) {
            highlightTableRowByIndex(originalIndexToHighlight);
        }
    }
    clearTimeout(autoPlayTimeoutId);
    playNextItem();
}
function playNextItem() {
    if (!isAutoPlaying || isAutoPaused) return;
    if (autoPlayCurrentIndex > autoPlayEndIndex || autoPlayCurrentIndex >= autoPlayWords.length) {
        stopAutoPlay();
        return;
    }
    if (!isSentenceModeActive && !isCardViewActive && !isExamModeActive) { 
        const currentPlayWordEntry = autoPlayWords[autoPlayCurrentIndex];
        const originalIndexToHighlight = currentWords.indexOf(currentPlayWordEntry);
        if (originalIndexToHighlight !== -1) {
            highlightTableRowByIndex(originalIndexToHighlight);
        }
    }
    const wordEntry = autoPlayWords[autoPlayCurrentIndex]; 
    if (!wordEntry) { 
        moveToNextWordInAutoPlay(); 
        scheduleNextPlay(100);
        return;
    }
    const wordToPlay = wordEntry.word ? wordEntry.word.replace(/\(.*?\)/g, '').trim() : '';
    const meaningToPlay = wordEntry.meaning ? wordEntry.meaning.replace(/\(.*?\)/g, '').trim() : '';
    const callbackAfterTTS = () => {
        if (isAutoPlaying && !isAutoPaused) {
            scheduleNextOrRepeat();
        }
    };
    if (autoPlayMode === 'both') {
        playTTS(wordToPlay, currentWordLanguage, currentWordVoice, () => {
            if (!isAutoPlaying || isAutoPaused) return;
            autoPlayTimeoutId = setTimeout(() => {
                if (!isAutoPlaying || isAutoPaused) return;
                playTTS(meaningToPlay, currentMeaningLanguage, currentMeaningVoice, callbackAfterTTS);
            }, 500); 
        });
    } else if (autoPlayMode === 'word') {
        playTTS(wordToPlay, currentWordLanguage, currentWordVoice, callbackAfterTTS);
    } else if (autoPlayMode === 'meaning') {
        playTTS(meaningToPlay, currentMeaningLanguage, currentMeaningVoice, callbackAfterTTS);
    }
}
function scheduleNextOrRepeat() { if (!isAutoPlaying || isAutoPaused) return; autoPlayCurrentRepeat++; if (autoPlayCurrentRepeat < autoPlayRepeats) { scheduleNextPlay(1000); } else { moveToNextWord(); scheduleNextPlay(1000); } }
function moveToNextWord() { autoPlayCurrentIndex++; autoPlayCurrentRepeat = 0; }
function scheduleNextPlay(delay) { if (!isAutoPlaying || isAutoPaused) return; clearTimeout(autoPlayTimeoutId); autoPlayTimeoutId = setTimeout(playNextItem, delay); }
function pauseAutoPlay() { if (!isAutoPlaying || isAutoPaused) return; isAutoPaused = true; clearTimeout(autoPlayTimeoutId); if (ttsAudio && !ttsAudio.paused) { ttsAudio.pause(); } updateAutoPlayButtons(); }
function resumeAutoPlay() { if (!isAutoPlaying || !isAutoPaused) return; isAutoPaused = false; updateAutoPlayButtons(); scheduleNextPlay(100); }
function stopAutoPlay() { if (!isAutoPlaying) return; isAutoPlaying = false; isAutoPaused = false; clearTimeout(autoPlayTimeoutId); if (ttsAudio && !ttsAudio.paused) { ttsAudio.pause(); ttsAudio.onended = null; ttsAudio.onerror = null; if (ttsAudio.src && ttsAudio.src.startsWith('blob:')) { try { URL.revokeObjectURL(ttsAudio.src); } catch (e) {} } } ttsAudio = new Audio(); updateAutoPlayButtons(); unhighlightAllTableRows(); }
// updateAutoPlayButtons 함수는 위에서 수정된 버전을 사용합니다.
function highlightTableRowByIndex(itemIndex) { 
    unhighlightAllTableRows();
    const tableBody = document.querySelector('#word-table-body tbody');
    if (tableBody) {
        const rowToHighlight = tableBody.querySelector(`tr[data-index="${itemIndex}"]`);
        if (rowToHighlight) {
            rowToHighlight.classList.add('highlighted-row');
        }
    }
}
function unhighlightAllTableRows() { const tb = document.querySelector('#word-table-body tbody'); if (tb) { tb.querySelectorAll('tr.highlighted-row').forEach(r => r.classList.remove('highlighted-row')); } }
function generateLanguageMenu() { const lc=document.getElementById('language-menu-content'); if (!lc) return; lc.innerHTML=''; lc.classList.add('language-accordion'); const ts=[{ key:'word',name:'단어 언어',setter:setWordLanguage,currentLangVar:currentWordLanguage,currentVoiceVar:currentWordVoice },{ key:'meaning',name:'의미 언어',setter:setMeaningLanguage,currentLangVar:currentMeaningLanguage,currentVoiceVar:currentMeaningVoice }]; ts.forEach(ti=>{ const td=document.createElement('div'); td.classList.add('language-type-item'); td.dataset.languageType=ti.key; const tl=document.createElement('a'); tl.href='#'; tl.textContent=ti.name; tl.classList.add('type-link'); td.appendChild(tl); const lld=document.createElement('div'); lld.classList.add('language-list'); td.appendChild(lld); tl.onclick=(e)=>{ e.preventDefault(); const ia=td.classList.contains('active'); lc.querySelectorAll('.language-type-item.active').forEach(item=>{ if(item!==td){ item.classList.remove('active'); item.querySelector('.language-list')?.classList.remove('open'); item.querySelectorAll('.voice-list.open').forEach(vl=>vl.classList.remove('open')); } }); td.classList.toggle('active',!ia); lld.classList.toggle('open',!ia); if(!ia){ lld.querySelectorAll('.voice-list.open').forEach(vl=>vl.classList.remove('open')); lld.querySelectorAll('.language-item.active').forEach(li=>li.classList.remove('active')); } }; for(const lcCode in voiceOptions){ const ld=voiceOptions[lcCode]; const lid=document.createElement('div'); lid.classList.add('language-item'); const ll=document.createElement('a'); ll.href='#'; ll.textContent=ld.name; ll.classList.add('lang-link'); ll.dataset.langCode=lcCode; lid.appendChild(ll); const vld=document.createElement('div'); vld.classList.add('voice-list'); lid.appendChild(vld); ll.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); const ivlo=vld.classList.contains('open'); lld.querySelectorAll('.language-item.active').forEach(item=>item.classList.remove('active')); lld.querySelectorAll('.voice-list.open').forEach(list=>{ if(list!==vld) list.classList.remove('open'); }); if(!ivlo){ lid.classList.add('active'); vld.classList.add('open'); const dv=ld.voices.length>0?ld.voices[0]:null; ti.setter(lcCode, dv); updateMenuSelectionVisuals(lc); } else { lid.classList.remove('active'); vld.classList.remove('open'); } }; ld.voices.forEach(vn=>{ const vl=document.createElement('a'); vl.href='#'; let di=vn.replace(lcCode+'-',''); vl.textContent=`└ ${di}`; vl.classList.add('voice-link'); vl.dataset.voiceName=vn; vld.appendChild(vl); vl.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); ti.setter(lcCode,vn); updateMenuSelectionVisuals(lc); lc.querySelectorAll('.active').forEach(el=>el.classList.remove('active')); lc.querySelectorAll('.open').forEach(el=>el.classList.remove('open')); const dc=lc.closest('.dropdown-content'); if(dc && document.activeElement instanceof HTMLElement){ document.activeElement.blur(); } }; }); lld.appendChild(lid); } lc.appendChild(td); }); updateMenuSelectionVisuals(lc); }
function updateMenuSelectionVisuals(mc) { if(!mc)return; mc.querySelectorAll('.type-link').forEach(l=>{const tk=l.closest('.language-type-item')?.dataset.languageType;if(tk==='word')l.textContent='단어 언어';else if(tk==='meaning')l.textContent='의미 언어';}); mc.querySelectorAll('.lang-link.selected, .voice-link.selected').forEach(el=>el.classList.remove('selected')); const ts=[{key:'word',currentLang:currentWordLanguage,currentVoice:currentWordVoice},{key:'meaning',currentLang:currentMeaningLanguage,currentVoice:currentMeaningVoice}]; ts.forEach(ti=>{ const td=mc.querySelector(`.language-type-item[data-language-type="${ti.key}"]`); if(!td)return; const tl=td.querySelector('.type-link'); let st=''; if(ti.currentLang&&voiceOptions[ti.currentLang]){ const ln=voiceOptions[ti.currentLang].name; st+=` > ${ln}`; const ll=td.querySelector(`.lang-link[data-lang-code="${ti.currentLang}"]`); if(ll){ ll.classList.add('selected'); if(ti.currentVoice){ const vlk=ll.parentElement.querySelector(`.voice-link[data-voice-name="${ti.currentVoice}"]`); if(vlk){ vlk.classList.add('selected'); let svn=ti.currentVoice.replace(ti.currentLang+'-',''); svn=svn.replace('Standard-','').replace('Wavenet-','').replace('Neural2-',''); st+=` (${svn})`; } } } } if(tl){ if(ti.key==='word')tl.textContent=`단어 언어${st}`; else if(ti.key==='meaning')tl.textContent=`의미 언어${st}`; } }); }
function setWordLanguage(lang, voice) { currentWordLanguage = lang; if (voice && voiceOptions[lang]?.voices?.includes(voice)) { currentWordVoice = voice; } else if (voiceOptions[lang]?.voices?.length > 0) { currentWordVoice = voiceOptions[lang].voices[0]; } else { currentWordVoice = null; } updateMenuSelectionVisuals(document.getElementById('language-menu-content')); }
function setMeaningLanguage(lang, voice) { currentMeaningLanguage = lang; if (voice && voiceOptions[lang]?.voices?.includes(voice)) { currentMeaningVoice = voice; } else if (voiceOptions[lang]?.voices?.length > 0) { currentMeaningVoice = voiceOptions[lang].voices[0]; } else { currentMeaningVoice = null; } updateMenuSelectionVisuals(document.getElementById('language-menu-content')); }
function selectExamTypeAndStart(type) {
    const filteredWordsForExam = currentWords.filter(wordEntry => {
        if (!wordEntry || typeof wordEntry !== 'object') return false;
        if (currentKnowledgeFilter === 'all') return true;
        const state = wordEntry.knowledgeState || 'unclassified';
        return state === currentKnowledgeFilter;
    });
    if (filteredWordsForExam.length === 0) {
        alert(`현재 필터 ('${getFilterDisplayName(currentKnowledgeFilter)}')로 시험 볼 단어가 없습니다.`);
        return;
    }
    if (type.startsWith('mc_') && filteredWordsForExam.length < 4) {
        alert(`현재 필터 ('${getFilterDisplayName(currentKnowledgeFilter)}')의 단어 수가 객관식 시험 최소 요건(4개) 미만입니다. (${filteredWordsForExam.length}개)`);
        return;
    }
    if (type === 'matching' && filteredWordsForExam.length < 5) {
        alert(`현재 필터 ('${getFilterDisplayName(currentKnowledgeFilter)}')의 단어 수가 짝짓기 시험 최소 요건(5개) 미만입니다. (${filteredWordsForExam.length}개)`);
        return;
    }
    if (isCardViewActive) toggleCardView();
    if (isSentenceModeActive) toggleSentenceMode();
    stopAutoPlay();
    isExamModeActive = true;
    currentExamType = type;
    document.body.classList.add('exam-mode-active');
    resetExamUI();
    startExamWithRange(type, 'all_filtered'); 
}
function getFilterDisplayName(filterKey) {
    if (filterKey === 'all') return '전체';
    if (filterKey === 'known') return '앎';
    if (filterKey === 'unsure') return '애매함';
    if (filterKey === 'unknown') return '모름';
    if (filterKey === 'unclassified') return '미분류';
    return filterKey;
}
function resetExamUI() { const ea=document.getElementById('examContentArea');const ma=document.getElementById('multipleChoiceArea');const mga=document.getElementById('matchingGameArea');const ec=document.getElementById('examControls');const er=document.getElementById('examResults');const bc=document.getElementById('btn-check-mc');const bn=document.getElementById('btn-next-item');const bs=document.getElementById('btn-show-results');const be=document.getElementById('btn-exit-exam');const mq=document.getElementById('mcQuestion');const mo=document.getElementById('mcOptions');const mf=document.getElementById('mcFeedback');const c1=document.getElementById('matchingCol1')?.querySelector('ul');const c2=document.getElementById('matchingCol2')?.querySelector('ul');const mgf=document.getElementById('matchingFeedback');const sd=document.getElementById('scoreDisplay');const ep=document.getElementById('examProgress'); if(ea)ea.style.display='none'; if(ma)ma.style.display='none'; if(mga)mga.style.display='none'; if(ec)ec.style.display='none'; if(er)er.style.display='none'; if(bc)bc.style.display='none'; if(bn)bn.style.display='none'; if(bs)bs.style.display='none'; if(be)be.style.display='none'; if(mq)mq.innerHTML=''; if(mo)mo.innerHTML=''; if(mf){mf.innerHTML='';mf.className='';} if(c1)c1.innerHTML=''; if(c2)c2.innerHTML=''; if(mgf){mgf.innerHTML='';mgf.className='';} if(sd)sd.innerHTML=''; if(ep)ep.textContent=''; }
function startExamWithRange(type, rangeOption) {
    const baseExamWords = currentWords.filter(wordEntry => {
        if (!wordEntry || typeof wordEntry !== 'object') return false;
        if (currentKnowledgeFilter === 'all') return true;
        const state = wordEntry.knowledgeState || 'unclassified'; 
        return state === currentKnowledgeFilter;
    });
    if (baseExamWords.length === 0) {
        alert(`현재 필터 ('${getFilterDisplayName(currentKnowledgeFilter)}')로 시험 볼 단어가 없습니다.`);
        return;
    }
    if (type.startsWith('mc_') && baseExamWords.length < 4) {
         alert(`현재 필터 ('${getFilterDisplayName(currentKnowledgeFilter)}')의 단어 수가 객관식 시험 최소 요건(4개) 미만입니다. (${baseExamWords.length}개)`);
         return;
    }
    if (type === 'matching' && baseExamWords.length < 5) {
        alert(`현재 필터 ('${getFilterDisplayName(currentKnowledgeFilter)}')의 단어 수가 짝짓기 시험 최소 요건(5개) 미만입니다. (${baseExamWords.length}개)`);
        return;
    }
    let startIndex = 0;
    let endIndex = baseExamWords.length - 1; 
    const filteredWordCount = baseExamWords.length;
    if (rangeOption === 'custom') { 
        let startNum, endNum;
        let isValidRange = false;
        while (!isValidRange) {
            const startStr = prompt(`[${getExamTypeName(type)} / 현재 필터: ${getFilterDisplayName(currentKnowledgeFilter)}] 시작 번호 (1 ~ ${filteredWordCount}):`, "1");
            if (startStr === null) return; 
            const endStr = prompt(`[${getExamTypeName(type)} / 현재 필터: ${getFilterDisplayName(currentKnowledgeFilter)}] 끝 번호 (0=끝까지, 1 ~ ${filteredWordCount}):`, "0");
            if (endStr === null) return; 
            startNum = parseInt(startStr);
            endNum = parseInt(endStr);
            if (isNaN(startNum) || startNum < 1 || startNum > filteredWordCount) {
                alert(`유효하지 않은 시작 번호입니다. (1 ~ ${filteredWordCount} 사이 입력)`);
                continue;
            }
            startIndex = startNum - 1; 
            if (isNaN(endNum) || endNum < 0 || endNum > filteredWordCount) { 
                alert(`유효하지 않은 끝 번호입니다. (0 또는 1 ~ ${filteredWordCount} 사이 입력)`);
                continue;
            }
            endIndex = (endNum === 0) ? filteredWordCount - 1 : endNum - 1; 
            if (endIndex < startIndex) {
                alert("끝 번호는 시작 번호보다 크거나 같아야 합니다.");
                continue;
            }
            const selectedWordCount = endIndex - startIndex + 1;
            if (type.startsWith('mc_') && selectedWordCount < 4) {
                alert(`선택된 범위의 단어 수가 객관식 시험 최소 요건(4개) 미만입니다. (${selectedWordCount}개). 범위를 다시 설정해주세요.`);
                continue;
            }
            if (type === 'matching' && selectedWordCount < 5) {
                alert(`선택된 범위의 단어 수가 짝짓기 시험 최소 요건(5개) 미만입니다. (${selectedWordCount}개). 범위를 다시 설정해주세요.`);
                continue;
            }
            isValidRange = true;
        }
    } else if (rangeOption === 'all_filtered' || rangeOption === 'all') { 
        startIndex = 0;
        endIndex = filteredWordCount - 1;
    } else { 
        startIndex = 0;
        endIndex = filteredWordCount - 1;
        console.warn("알 수 없는 시험 범위 옵션:", rangeOption, ". 필터링된 전체 단어로 진행합니다.");
    }
    startIndex = Math.max(0, Math.min(startIndex, filteredWordCount - 1));
    endIndex = Math.max(startIndex, Math.min(endIndex, filteredWordCount - 1));
    const finalSelectedExamWords = baseExamWords.slice(startIndex, endIndex + 1);
    if (finalSelectedExamWords.length === 0) {
        alert("선택된 범위에 시험 볼 단어가 없습니다.");
        return;
    }
    if (type.startsWith('mc_') && finalSelectedExamWords.length < 4) {
        alert("선택된 범위의 단어 수가 객관식 시험 최소 요건(4개)에 미치지 못합니다."); return;
    }
    if (type === 'matching' && finalSelectedExamWords.length < 5) {
        alert("선택된 범위의 단어 수가 짝짓기 시험 최소 요건(5개)에 미치지 못합니다."); return;
    }
    if (isCardViewActive) toggleCardView();
    if (isSentenceModeActive) toggleSentenceMode();
    stopAutoPlay();
    isExamModeActive = true;
    currentExamType = type;
    document.body.classList.add('exam-mode-active');
    resetExamUI();
    startExam(finalSelectedExamWords);
}
function getExamTypeName(type) { switch (type) { case 'mc_word': return '단어→뜻'; case 'mc_meaning': return '뜻→단어'; case 'matching': return '짝짓기'; default: return '시험'; } }
function startExam(wordsForThisExam) { 
    examWords = [...wordsForThisExam]; 
    shuffleArray(examWords); 
    if (examWords.length === 0) {
        alert("시험 볼 단어가 없습니다.");
        exitExam(); 
        return;
    }
    if (currentExamType.startsWith('mc_') && examWords.length < 4) {
        alert("객관식 시험을 진행하기에 단어 수가 부족합니다 (최소 4개 필요).");
        exitExam();
        return;
    }
    if (currentExamType === 'matching' && examWords.length < 5) {
        alert("짝짓기 시험을 진행하기에 단어 수가 부족합니다 (최소 5개 필요).");
        exitExam();
        return;
    }
    totalExamItems = examWords.length; 
    currentExamIndex = 0;
    examScore = 0;
    selectedAnswerIndex = -1;
    currentCorrectIndex = -1;
    selectedMatchItem1 = null;
    selectedMatchItem2 = null;
    matchingPairsData = [];
    correctMatches = 0;
    totalCorrectMatches = 0;
    currentMatchingSet = 1;
    totalMatchingSets = (currentExamType === 'matching') ? Math.ceil(totalExamItems / MATCHING_SET_SIZE) : 1;
    const ecArea = document.getElementById('examContentArea');
    const eCtrls = document.getElementById('examControls');
    const mcArea = document.getElementById('multipleChoiceArea');
    const mgArea = document.getElementById('matchingGameArea');
    const btnExit = document.getElementById('btn-exit-exam');
    const btnCheck = document.getElementById('btn-check-mc');
    const btnNext = document.getElementById('btn-next-item');
    const btnShow = document.getElementById('btn-show-results');
    if (!ecArea || !eCtrls || !mcArea || !mgArea || !btnExit || !btnCheck || !btnNext || !btnShow) {
        console.error("시험 UI 요소를 찾을 수 없습니다.");
        exitExam();
        return;
    }
    mcArea.style.display = 'none';
    mgArea.style.display = 'none';
    btnCheck.style.display = 'none';
    btnNext.style.display = 'none';
    btnShow.style.display = 'none';
    ecArea.style.display = 'flex';
    eCtrls.style.display = 'block';
    btnExit.style.display = 'inline-block';
    setTimeout(() => {
        if (!isExamModeActive) return; 
        if (currentExamType.startsWith('mc_')) {
            mcArea.style.display = 'block';
            btnCheck.style.display = 'inline-block';
            btnCheck.disabled = true; 
            displayNextMCQuestion();
        } else if (currentExamType === 'matching') {
            mgArea.style.display = 'block';
            setupMatchingGame();
        }
        updateExamProgress();
    }, 10); 
}
function updateExamProgress() { const pe = document.getElementById('examProgress'); if (!pe) return; const isMobile = window.innerWidth <= 480; if (currentExamType.startsWith('mc_')) { const prefix = isMobile ? '' : '문제 '; pe.textContent = `${prefix}${currentExamIndex + 1} / ${totalExamItems}`; } else if (currentExamType === 'matching') { const itemsInCurrentSet = currentExamItems.length; if (isMobile) { pe.textContent = `${correctMatches}/${itemsInCurrentSet} (${currentMatchingSet}/${totalMatchingSets})`; } else { pe.textContent = `맞춘 짝: ${correctMatches} / ${itemsInCurrentSet} (세트 ${currentMatchingSet} / ${totalMatchingSets})`; } } else { pe.textContent = ''; } }
function displayNextMCQuestion() {
    if (currentExamIndex >= totalExamItems) {
        showExamResults();
        return;
    }
    const questionEntry = examWords[currentExamIndex]; 
    const optionsListElement = document.getElementById('mcOptions');
    const questionDisplayElement = document.getElementById('mcQuestion');
    const feedbackDisplayElement = document.getElementById('mcFeedback');
    if (!optionsListElement || !questionDisplayElement || !feedbackDisplayElement || !questionEntry) {
        console.error("객관식 문제 표시를 위한 DOM 요소 또는 문제 데이터가 없습니다.");
        exitExam();
        return;
    }
    optionsListElement.innerHTML = ''; 
    feedbackDisplayElement.innerHTML = '';
    feedbackDisplayElement.className = ''; 
    selectedAnswerIndex = -1; 
    let questionText = '';
    let correctAnswerText = '';
    if (currentExamType === 'mc_word') { 
        questionText = questionEntry.word;
        correctAnswerText = questionEntry.meaning;
    } else { 
        questionText = questionEntry.meaning;
        correctAnswerText = questionEntry.word;
    }
    questionDisplayElement.textContent = questionText || '[질문 없음]';
    let options = [correctAnswerText];
    const distractorsPool = currentWords.filter(word => {
        if (!word || typeof word !== 'object') return false;
        const isSameAsQuestionWord = (word.word === questionEntry.word && word.meaning === questionEntry.meaning);
        if (isSameAsQuestionWord) return false;
        if (currentExamType === 'mc_word' && word.meaning === correctAnswerText) return false;
        if (currentExamType === 'mc_meaning' && word.word === correctAnswerText) return false;
        return true;
    });
    shuffleArray(distractorsPool); 
    for (let i = 0; i < Math.min(3, distractorsPool.length); i++) { 
        options.push((currentExamType === 'mc_word') ? distractorsPool[i].meaning : distractorsPool[i].word);
    }
    let tempOptionCounter = 1;
    while (options.length < 4) {
        let tempDistractor = `오답${tempOptionCounter++}`;
        if (!options.includes(tempDistractor)) {
            options.push(tempDistractor);
        }
        if (tempOptionCounter > 100) break; 
    }
    let shuffledOptions = shuffleArray(options.filter(opt => opt !== undefined && opt !== null)); 
    currentCorrectIndex = shuffledOptions.findIndex(opt => opt === correctAnswerText);
    if (currentCorrectIndex === -1 && correctAnswerText !== undefined && correctAnswerText !== null) {
        shuffledOptions.pop(); 
        shuffledOptions.unshift(correctAnswerText); 
        currentCorrectIndex = 0;
        shuffledOptions = shuffleArray(shuffledOptions); 
        currentCorrectIndex = shuffledOptions.findIndex(opt => opt === correctAnswerText); 
    }
    optionsListElement.innerHTML = ''; 
    shuffledOptions.forEach((optionText, index) => {
        const listItem = document.createElement('li');
        listItem.textContent = optionText || '[빈 선택지]';
        listItem.dataset.index = index;
        listItem.addEventListener('click', handleMCAnswerClick);
        optionsListElement.appendChild(listItem);
    });
    const checkButton = document.getElementById('btn-check-mc');
    const nextButton = document.getElementById('btn-next-item');
    if (checkButton) {
        checkButton.disabled = true; 
        checkButton.style.display = 'inline-block';
    }
    if (nextButton) {
        nextButton.style.display = 'none'; 
    }
    updateExamProgress();
}
function handleMCAnswerClick(event) { const cli = event.target.closest('li'); if (!cli || !cli.dataset || typeof cli.dataset.index === 'undefined') return; const idx = parseInt(cli.dataset.index, 10); if (isNaN(idx)) return; selectMCAnswer(idx, cli); }
function selectMCAnswer(index, element) { const bc = document.getElementById('btn-check-mc'); if (bc && bc.style.display === 'none') return; selectedAnswerIndex = index; document.querySelectorAll('#mcOptions li').forEach(li => li.classList.remove('selected')); element.classList.add('selected'); if (bc) bc.disabled = false; }
function checkMCAnswer() { if (selectedAnswerIndex === -1) return; const oi = document.querySelectorAll('#mcOptions li'); const fd = document.getElementById('mcFeedback'); const bc = document.getElementById('btn-check-mc'); const bn = document.getElementById('btn-next-item'); if (!oi.length || !fd || !bc || !bn) return; let isCorrect = (selectedAnswerIndex === currentCorrectIndex); fd.className = ''; if (isCorrect) { examScore++; fd.textContent = "정답!"; fd.classList.add('correct'); if (oi[selectedAnswerIndex]) { oi[selectedAnswerIndex].classList.add('correct'); oi[selectedAnswerIndex].classList.remove('selected'); } } else { fd.textContent = "오답!"; fd.classList.add('incorrect'); if (oi[selectedAnswerIndex]) { oi[selectedAnswerIndex].classList.add('incorrect'); oi[selectedAnswerIndex].classList.remove('selected'); } if (currentCorrectIndex >= 0 && currentCorrectIndex < oi.length && oi[currentCorrectIndex]) { oi[currentCorrectIndex].classList.add('correct'); } } bc.disabled = true; bc.style.display = 'none'; bn.style.display = 'inline-block'; oi.forEach(li => { li.removeEventListener('click', handleMCAnswerClick); li.onclick = null; }); }
function setupMatchingGame() {
    const column1List = document.getElementById('matchingCol1')?.querySelector('ul');
    const column2List = document.getElementById('matchingCol2')?.querySelector('ul');
    const feedbackDisplay = document.getElementById('matchingFeedback');
    if (!column1List || !column2List || !feedbackDisplay) {
        console.error("짝짓기 게임 UI 요소를 찾을 수 없습니다.");
        exitExam();
        return;
    }
    column1List.innerHTML = '';
    column2List.innerHTML = '';
    feedbackDisplay.innerHTML = '';
    feedbackDisplay.className = '';
    selectedMatchItem1 = null;
    selectedMatchItem2 = null;
    matchingPairsData = []; 
    correctMatches = 0;     
    const startIndexInExamWords = (currentMatchingSet - 1) * MATCHING_SET_SIZE;
    const endIndexInExamWords = Math.min(startIndexInExamWords + MATCHING_SET_SIZE, totalExamItems);
    currentExamItems = examWords.slice(startIndexInExamWords, endIndexInExamWords);
    if (currentExamItems.length === 0) { 
        if (totalCorrectMatches > 0 || currentMatchingSet > 1) { 
            showExamResults();
        } else { 
            alert("짝짓기 시험을 진행할 단어가 없습니다.");
            exitExam();
        }
        return;
    }
    currentExamItems.forEach((item, index) => {
        if (item && item.word && item.meaning) {
            matchingPairsData.push({ id: index, wordText: item.word, meaningText: item.meaning, matched: false });
        } else {
            console.warn(`짝짓기 데이터 오류: index ${index} (currentExamItems 기준), item:`, item);
        }
    });
    if (matchingPairsData.length === 0) { 
         alert("짝짓기 게임을 위한 유효한 단어 쌍이 없습니다.");
         exitExam();
         return;
    }
    const wordsForColumn1 = shuffleArray(matchingPairsData.map(item => ({ id: item.id, text: item.wordText, type: 'word' })));
    const meaningsForColumn2 = shuffleArray(matchingPairsData.map(item => ({ id: item.id, text: item.meaningText, type: 'meaning' })));
    populateMatchingColumn(column1List, wordsForColumn1);
    populateMatchingColumn(column2List, meaningsForColumn2);
    updateExamProgress(); 
}
function shuffleArray(array) { let na=[...array]; for (let i=na.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [na[i], na[j]]=[na[j], na[i]]; } return na; }
function populateMatchingColumn(ul, items) { ul.innerHTML=''; items.forEach(item => { const li=document.createElement('li'); li.textContent=item.text||'[빈 항목]'; li.dataset.id=item.id; li.dataset.type=item.type; li.addEventListener('click', handleMatchItemClick); ul.appendChild(li); }); }
function handleMatchItemClick(event) { const cli=event.target.closest('li'); if (!cli||cli.classList.contains('matched')) return; const ci={ element:cli, id:parseInt(cli.dataset.id, 10), type:cli.dataset.type }; const fd=document.getElementById('matchingFeedback'); fd.textContent=''; fd.className=''; if (!selectedMatchItem1) { document.querySelectorAll('.matching-column li.selected-match').forEach(el => el.classList.remove('selected-match')); selectedMatchItem1=ci; cli.classList.add('selected-match'); } else { if (selectedMatchItem1.element===cli) { selectedMatchItem1.element.classList.remove('selected-match'); selectedMatchItem1=null; } else if (selectedMatchItem1.type===ci.type) { selectedMatchItem1.element.classList.remove('selected-match'); selectedMatchItem1=ci; cli.classList.add('selected-match'); } else { selectedMatchItem2=ci; checkMatch(); } } }
function checkMatch() { if (!selectedMatchItem1||!selectedMatchItem2) return; const fd=document.getElementById('matchingFeedback'); const isCorrect=(selectedMatchItem1.id===selectedMatchItem2.id); const i1=selectedMatchItem1; const i2=selectedMatchItem2; selectedMatchItem1=null; selectedMatchItem2=null; if (isCorrect) { correctMatches++; totalCorrectMatches++; fd.textContent="정답!"; fd.classList.add('correct'); i1.element.classList.add('matched'); i1.element.classList.remove('selected-match'); i1.element.removeEventListener('click', handleMatchItemClick); i1.element.onclick=null; i2.element.classList.add('matched'); i2.element.classList.remove('selected-match'); i2.element.removeEventListener('click', handleMatchItemClick); i2.element.onclick=null; const pd=matchingPairsData.find(p=>p.id===i1.id); if(pd) pd.matched=true; updateExamProgress(); if (correctMatches===currentExamItems.length) { fd.textContent=`세트 ${currentMatchingSet} 완료!`; if (currentMatchingSet<totalMatchingSets) { currentMatchingSet++; setTimeout(setupMatchingGame, 1000); } else { fd.textContent="모든 짝 맞춤!"; const bs=document.getElementById('btn-show-results'); if (bs) bs.style.display='inline-block'; } } } else { fd.textContent="오답!"; fd.classList.add('incorrect'); i1.element.classList.add('incorrect-shake'); if (i2 && i2.element) i2.element.classList.add('incorrect-shake'); setTimeout(() => { i1.element.classList.remove('selected-match', 'incorrect-shake'); if (i2 && i2.element) i2.element.classList.remove('incorrect-shake'); fd.textContent=''; fd.className=''; }, 700); } }
function nextExamItem() { if (currentExamType.startsWith('mc_')) { currentExamIndex++; displayNextMCQuestion(); } }
function showExamResults() { const ecArea=document.getElementById('examContentArea'); const eCtrls=document.getElementById('examControls'); const eRes=document.getElementById('examResults'); const sDisp=document.getElementById('scoreDisplay'); const eProg=document.getElementById('examProgress'); if (!ecArea||!eCtrls||!eRes||!sDisp||!eProg) return; ecArea.style.display='none'; eCtrls.style.display='none'; let fs=examScore; let ft=totalExamItems; if (currentExamType==='matching') { fs=totalCorrectMatches; ft=totalExamItems; } const perc=ft>0?Math.round((fs/ft)*100):0; let rt=`총 ${ft}개 중 ${fs}개 정답 (${perc}%)`; if (currentExamType==='matching') { rt=`총 ${ft}쌍 중 ${fs}쌍 성공 (${perc}%)`; } sDisp.innerHTML=rt; if(eProg) eProg.textContent='시험 완료'; const rob=eRes.querySelector('.control-btn'); if (rob) rob.style.display='inline-block'; eRes.style.display='flex'; }
function exitExam() { isExamModeActive=false; currentExamType=null; document.body.classList.remove('exam-mode-active'); resetExamUI(); if(isSentenceModeActive) renderSentenceView(); else renderWordList(); }
function sortFolders(type) { if(type!=='name_asc'&&type!=='name_desc')return; fetch('/api/folders/sort', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ sort_type:type }), }).then(handleResponse).then(d=> { folders = d.folders; renderFolderTree(folders); }).catch(handleError); }
function setupAccordionMenus() { const ads=document.querySelectorAll('.accordion-dropdown'); ads.forEach(d=>{ const ts=d.querySelectorAll('.submenu-toggle'); ts.forEach(t=>{ const pi=t.closest('.submenu-item'); const c=pi?.querySelector('.submenu-content'); if(!pi||!c)return; t.addEventListener('click', function(e){ e.preventDefault(); const coi=d.querySelector('.submenu-item.open'); if(coi&&coi!==pi){ coi.classList.remove('open'); const ot=coi.querySelector('.submenu-toggle'); if(ot)ot.textContent=ot.textContent.replace('▲', '▼'); } const io=pi.classList.toggle('open'); this.textContent=this.textContent.replace(io?'▼':'▲', io?'▲':'▼'); }); }); }); }


async function backupVocabulary() {
    try {
        const snapshot = await db.collection('folders').get();
        const backupData = {};
        snapshot.forEach(doc => {
            backupData[doc.id] = doc.data(); // 문서 ID를 키로 하여 데이터 저장
        });

        if (Object.keys(backupData).length === 0) {
            alert('백업할 데이터가 없습니다.');
            return;
        }

        const jsonData = JSON.stringify(backupData, null, 2);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `vocabulary_backup_${timestamp}.json`;

        // 웹 브라우저의 다운로드 기능 사용
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        handleError(new Error(`백업 데이터 생성 실패: ${error.message}`));
    }
}

function handleBackupFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json')) {
        alert('JSON 파일(.json)을 선택해주세요.');
        event.target.value = null;
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const backupData = JSON.parse(e.target.result);
            if (typeof backupData !== 'object' || backupData === null || Array.isArray(backupData)) {
                throw new Error("유효하지 않은 백업 파일 형식입니다.");
            }

            if (!confirm("백업을 복원하시겠습니까? 현재 모든 데이터는 백업 파일의 내용으로 덮어씌워집니다.")) {
                return;
            }

            // Firestore에 데이터 일괄 쓰기 (Batch Write)
            const batch = db.batch();
            for (const folderId in backupData) {
                if (backupData.hasOwnProperty(folderId)) {
                    const docRef = db.collection('folders').doc(folderId);
                    batch.set(docRef, backupData[folderId]);
                }
            }
            
            await batch.commit(); // 일괄 작업 실행

            alert('백업 복원이 성공적으로 완료되었습니다. 페이지를 새로고침합니다.');
            window.location.reload(); // 복원 후 페이지 새로고침하여 데이터 다시 로드

        } catch (error) {
            handleError(new Error(`백업 파일 처리 오류: ${error.message}`));
        } finally {
            event.target.value = null;
        }
    };
    reader.onerror = () => {
        alert("파일을 읽는 중 오류가 발생했습니다.");
        event.target.value = null;
    };
    reader.readAsText(file);
}

function triggerBackupLoad() { const i=document.getElementById('backup-file-input'); if(i)i.click(); }

function escapeCsvField(field){ const s=String(field??'');if(s.includes(',')||s.includes('"')||s.includes('\n')||s.includes('\r')){return `"${s.replace(/"/g,'""')}"`;}return s; }
function exportVocabulary() {
    if (!currentFolderPath){ alert('내보낼 폴더 선택'); return; }
    if (!currentWords||currentWords.length===0){ alert('내보낼 항목 없음'); return; }
    try {
        let csv='"Word","Meaning","Part of Speech","Entries","IsStudied","KnowledgeState"\n'; // knowledgeState 추가
        currentWords.forEach(entry=>{
            if (entry && typeof entry === 'object') {
                const word = entry.word || '';
                const meaning = entry.meaning || '';
                const pos = entry.part_of_speech || '';
                const isStudied = entry.isStudied || false; 
                const knowledgeState = entry.knowledgeState || 'unknown'; // knowledgeState 값 가져오기
                let entriesStr = '';
                if (Array.isArray(entry.entries)) {
                    entry.entries.forEach(item => {
                        if (item) {
                             entriesStr += `[Def: ${item.definition || ''}] [Ex: ${item.example || ''}] [Tr: ${item.translation || ''}] | `;
                        }
                    });
                    entriesStr = entriesStr.slice(0, -3);
                }
                csv += `${escapeCsvField(word)},${escapeCsvField(meaning)},${escapeCsvField(pos)},${escapeCsvField(entriesStr)},${escapeCsvField(isStudied)},${escapeCsvField(knowledgeState)}\n`; 
            }
        });
        const sfn=currentFolderPath.replace(/[\/\\?%*:|"<>]/g, '_'); const ts=new Date().toISOString().replace(/[:.]/g, '-'); const fn=`export_${sfn}_${ts}.csv`;
        if (window.AndroidInterface&&typeof window.AndroidInterface.saveCsvExport==='function'){ window.AndroidInterface.saveCsvExport(csv, fn); } else { const bom="\uFEFF"; const b=new Blob([bom+csv],{type:'text/csv;charset=utf-8;'}); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=fn; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); }
    } catch (e){ handleError(new Error(`CSV 내보내기 오류: ${e.message}`)); }
}
function setupColumnResizing() { const ht = document.getElementById('word-table-header'); const bt = document.getElementById('word-table-body'); if (!ht || !bt || !ht.querySelector('colgroup col') || !bt.querySelector('colgroup col')) { if (columnResizingActive) removeResizeListeners(); return; } if (columnResizingActive) return; createResizeListeners(); columnResizingActive = true; }
function removeResizeListeners() { removeMoveEndListeners(); columnResizingActive = false; isResizing = false; }
function createResizeListeners() { const ht = document.getElementById('word-table-header'); if (!ht) return; const hc = ht.querySelectorAll('thead th'); hc.forEach((th, i) => { if (i > 0) { const irh = (e) => initResize(e, i - 1); th.addEventListener('mousedown', irh); th.addEventListener('touchstart', irh, { passive: false }); } }); }
function initResize(e, lci) { if (e.type === 'touchstart' && e.cancelable) e.preventDefault(); if (isResizing) return; isResizing = true; colLeftIndex = lci; startX = (e.type === 'touchstart') ? e.touches[0].clientX : e.clientX; const ht = document.getElementById('word-table-header'); const bt = document.getElementById('word-table-body'); if (!ht || !bt) { isResizing = false; return; } const hcs = ht.querySelectorAll('colgroup col'); const bcs = bt.querySelectorAll('colgroup col'); if (colLeftIndex < 0 || colLeftIndex >= hcs.length - 1 || colLeftIndex >= bcs.length - 1) { isResizing = false; return; } colLeft = { header: hcs[colLeftIndex], body: bcs[colLeftIndex] }; colRight = { header: hcs[colLeftIndex + 1], body: bcs[colLeftIndex + 1] }; startWidthLeft = colLeft.header.offsetWidth; startWidthRight = colRight.header.offsetWidth; addMoveEndListeners(); document.body.classList.add('resizing-column'); }
function handleMove(e) { if (!isResizing || !colLeft || !colRight) return; if (e.type === 'touchmove' && e.cancelable) e.preventDefault(); let cx; if (e.type === 'touchmove') { if (!e.touches || e.touches.length === 0) return; cx = e.touches[0].clientX; } else { cx = e.clientX; } const dx = cx - startX; const mw = 40; let nwl = startWidthLeft + dx; let nwr = startWidthRight - dx; if (nwl < mw) { const adj = mw - nwl; nwl = mw; nwr -= adj; } if (nwr < mw) { const adj = mw - nwr; nwr = mw; nwl -= adj; } if (nwl < mw) nwl = mw; if (nwr < mw) nwr = mw; requestAnimationFrame(() => { if (!colLeft || !colRight) return; colLeft.header.style.width = `${nwl}px`; colLeft.body.style.width = `${nwl}px`; colRight.header.style.width = `${nwr}px`; colRight.body.style.width = `${nwr}px`; }); }
function handleEnd(e) { if (!isResizing) return; removeMoveEndListeners(); document.body.classList.remove('resizing-column'); colLeft = null; colRight = null; isResizing = false; }
function addMoveEndListeners() { removeMoveEndListeners(); document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleEnd); document.addEventListener('touchmove', handleMove, { passive: false }); document.addEventListener('touchend', handleEnd); document.addEventListener('touchcancel', handleEnd); }
function removeMoveEndListeners() { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleEnd); document.removeEventListener('touchmove', handleMove); document.removeEventListener('touchend', handleEnd); document.removeEventListener('touchcancel', handleEnd); }
function enterSelectionMode() {
    if (isInSelectionMode) return;
    isInSelectionMode = true;
    document.body.classList.add('selection-mode');
    document.getElementById('btn-delete-selected').style.display = 'inline-block';
    document.getElementById('btn-move-selected').style.display = 'inline-block'; 
    document.getElementById('btn-cancel-selection').style.display = 'inline-block';
    renderWordList();
    hideContextMenu();
    hideFolderContextMenu();
}
function cancelSelectionMode() {
    if (!isInSelectionMode) return;
    isInSelectionMode = false;
    document.body.classList.remove('selection-mode');
    document.getElementById('btn-delete-selected').style.display = 'none';
    document.getElementById('btn-move-selected').style.display = 'none'; 
    document.getElementById('btn-cancel-selection').style.display = 'none';
    const sac = document.getElementById('select-all-checkbox');
    if (sac) { sac.checked = false; sac.indeterminate = false; }
    renderWordList();
}
function toggleSelectAll(isChecked) { if (!isInSelectionMode) return; const cs = document.querySelectorAll('#word-table-body .word-row-checkbox'); cs.forEach(c => { c.checked = isChecked; const r = c.closest('tr'); if (r) { r.classList.toggle('row-selected', isChecked); } }); const sac = document.getElementById('select-all-checkbox'); if (sac) { sac.indeterminate = false; } }
function deleteSelectedWords() { if (!isInSelectionMode) return; const ccs = document.querySelectorAll('#word-table-body .word-row-checkbox:checked'); const itd = []; ccs.forEach(c => { itd.push(parseInt(c.value, 10)); }); if (itd.length === 0) { alert("삭제할 항목 선택"); return; } if (confirm(`${itd.length}개 항목 삭제?`)) { itd.sort((a, b) => b - a); fetch('/api/words/delete_multiple', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ path: currentFolderPath, indices: itd }), }).then(handleResponse).then(d => { currentWords = d.words; alert(`${itd.length}개 삭제 완료.`); cancelSelectionMode(); }).catch(handleError); } }
function getSelectedWordIndices() {
    if (!isInSelectionMode) return [];
    const checkedCheckboxes = document.querySelectorAll('#word-table-body .word-row-checkbox:checked');
    const indices = [];
    checkedCheckboxes.forEach(checkbox => {
        indices.push(parseInt(checkbox.value, 10));
    });
    return indices.sort((a, b) => a - b); 
}
function triggerMoveSelectedWords() {
    if (!isInSelectionMode) {
        alert("먼저 '선택 관리 시작'을 눌러 단어를 선택하세요.");
        return;
    }
    const selectedIndices = getSelectedWordIndices();
    if (selectedIndices.length === 0) {
        alert("이동할 단어를 선택하세요.");
        return;
    }
    showFolderSelectModal((targetFolderPath) => { 
        if (targetFolderPath) {
            if (confirm(`${selectedIndices.length}개의 단어를 '${targetFolderPath}' 폴더로 이동하시겠습니까?`)) {
                moveMultipleWords(targetFolderPath, selectedIndices);
            }
        }
    });
}
async function moveSelectedWords(targetFolderPath, wordIndices) {
    if (!currentFolderPath || !targetFolderPath || !wordIndices || wordIndices.length === 0) {
        console.error("이동 정보 부족:", currentFolderPath, targetFolderPath, wordIndices);
        return;
    }
    try {
        const response = await fetch('/api/words/move_multiple', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourcePath: currentFolderPath,
                targetPath: targetFolderPath,
                wordIndices: wordIndices
            }),
        });
        const data = await handleResponse(response);
        alert(data.message || `${wordIndices.length}개 단어 이동 완료.`);
        currentWords = data.sourceWords || [];
        if (isSentenceModeActive) renderSentenceView(); else renderWordList();
        cancelSelectionMode(); 
    } catch (error) {
        handleError(error);
    }
}
function showFolderSelectModal(callback) {
    const modal = document.getElementById('folder-select-modal');
    const folderListDiv = document.getElementById('modal-folder-list');
    if (!modal || !folderListDiv) {
        console.error("폴더 선택 모달 요소를 찾을 수 없습니다.");
        if (callback) callback(null); 
        return;
    }
    folderSelectCallback = callback;
    folderListDiv.innerHTML = '';
    fetch('/api/folders')
        .then(handleResponse)
        .then(data => {
            const allFolders = data.folders || [];
            const availableFoldersForModal = [];
            function collectAvailableFolders(nodes, currentParentPath = '') {
                if (!Array.isArray(nodes)) return;
                nodes.forEach(node => {
                    if (node && node.name) {
                        const fullPath = currentParentPath ? `${currentParentPath}/${node.name}` : node.name;
                        if (!node.isDefault && fullPath !== currentFolderPath && fullPath !== "복습 절실") {
                            availableFoldersForModal.push({
                                name: node.name, 
                                path: fullPath,  
                                depth: currentParentPath.split('/').filter(p => p).length 
                            });
                        }
                        if (node.children && node.children.length > 0) {
                            collectAvailableFolders(node.children, fullPath);
                        }
                    }
                });
            }
            collectAvailableFolders(allFolders); 
            if (availableFoldersForModal.length === 0) {
                folderListDiv.innerHTML = '<p style="color: #888;">이동할 수 있는 다른 사용자 폴더가 없습니다.</p>';
            } else {
                const ul = document.createElement('ul');
                ul.style.listStyle = 'none';
                ul.style.padding = '0';
                availableFoldersForModal.forEach(folder => {
                    const li = document.createElement('li');
                    const button = document.createElement('button');
                    const prefix = '· '.repeat(folder.depth); 
                    button.textContent = prefix + folder.name;
                    button.classList.add('modal-folder-button');
                    button.title = folder.path; 
                    button.onclick = () => {
                        if (folderSelectCallback) {
                            folderSelectCallback(folder.path); 
                        }
                        closeFolderSelectModal();
                    };
                    li.appendChild(button);
                    ul.appendChild(li);
                });
                folderListDiv.appendChild(ul);
            }
            modal.style.display = 'block';
        })
        .catch(error => {
            handleError(new Error("폴더 목록을 가져오는 데 실패했습니다: " + error.message));
            closeFolderSelectModal();
            if (folderSelectCallback) folderSelectCallback(null); 
        });
}
function closeFolderSelectModal() {
    const modal = document.getElementById('folder-select-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    folderSelectCallback = null;
}
function setupContextMenuListeners() {
    const wordTableBody = document.getElementById('word-table-body');
    if (wordTableBody) {
        wordTableBody.addEventListener('contextmenu', handleItemContextMenu); 
        wordTableBody.addEventListener('touchstart', handleItemTouchStart, { passive: true }); 
        wordTableBody.addEventListener('touchmove', handleItemTouchMove);     
        wordTableBody.addEventListener('touchend', handleItemTouchEnd);       
        wordTableBody.addEventListener('touchcancel', handleItemTouchEnd);    
    }
    const sentenceListContainer = document.getElementById('sentence-list-container');
    if (sentenceListContainer) {
        sentenceListContainer.addEventListener('contextmenu', handleItemContextMenu); 
        sentenceListContainer.addEventListener('touchstart', handleItemTouchStart, { passive: true }); 
        sentenceListContainer.addEventListener('touchmove', handleItemTouchMove);     
        sentenceListContainer.addEventListener('touchend', handleItemTouchEnd);       
        sentenceListContainer.addEventListener('touchcancel', handleItemTouchEnd);    
    }
    const wordContextMenu = document.getElementById('context-menu');
    if (wordContextMenu) {
        wordContextMenu.querySelector('#ctx-edit')?.addEventListener('click', handleContextMenuEdit);
        wordContextMenu.querySelector('#ctx-insert-above')?.addEventListener('click', handleContextMenuInsertAbove);
        wordContextMenu.querySelector('#ctx-delete')?.addEventListener('click', handleContextMenuDelete);
        wordContextMenu.querySelector('#ctx-move-review')?.addEventListener('click', handleContextMenuMoveToReview);
        wordContextMenu.querySelector('#ctx-move-other')?.addEventListener('click', handleContextMenuMoveToOther);
        wordContextMenu.querySelector('#ctx-restore-origin')?.addEventListener('click', handleContextMenuRestoreOrigin);
        wordContextMenu.querySelector('#ctx-toggle-selection-mode')?.addEventListener('click', handleContextMenuToggleSelectionMode); 
    }
    document.removeEventListener('click', handleClickOutsideMenus_Combined, true);
    document.addEventListener('click', handleClickOutsideMenus_Combined, true);
    const folderListElement = document.getElementById('folder-list');
    if (folderListElement) {
        folderListElement.addEventListener('contextmenu', handleFolderEvent_Delegated);
        folderListElement.addEventListener('touchstart', handleFolderEvent_Delegated, { passive: true });
        folderListElement.addEventListener('touchmove', handleFolderEvent_Delegated);
        folderListElement.addEventListener('touchend', handleFolderEvent_Delegated);
        folderListElement.addEventListener('touchcancel', handleFolderEvent_Delegated);
    }
    const folderContextMenu = document.getElementById('folder-context-menu');
    if (folderContextMenu) {
        folderContextMenu.querySelector('#ctx-folder-rename')?.addEventListener('click', handleFolderContextMenuRename);
        folderContextMenu.querySelector('#ctx-folder-delete')?.addEventListener('click', handleFolderContextMenuDelete);
        folderContextMenu.querySelector('#ctx-folder-new-subfolder')?.addEventListener('click', handleFolderContextMenuNewSubfolder);
    }
}
function handleItemContextMenu(e) {
    let itemIndex = null;
    let viewType = null;
    let targetForMenu = null; 
    const td = e.target.closest('td.col-word, td.col-meaning');
    if (td) {
        const row = td.closest('tr');
        if (row && row.dataset.index !== undefined) {
            itemIndex = parseInt(row.dataset.index, 10);
            viewType = 'wordlist';
            targetForMenu = row;
        }
    } else {
        const sentenceClickableArea = e.target.closest('.sentence-entry .headword, .sentence-entry .definition, .sentence-entry .example-sentence, .sentence-entry');
        if (sentenceClickableArea) {
            const entryDiv = sentenceClickableArea.closest('.sentence-entry');
            if (entryDiv && entryDiv.dataset.originalIndex !== undefined) { 
                itemIndex = parseInt(entryDiv.dataset.originalIndex, 10);
                viewType = 'sentenceview';
                targetForMenu = entryDiv;
            }
        }
    }
    if (itemIndex !== null && !isNaN(itemIndex) && viewType) {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, itemIndex, viewType);
    } else {
    }
}
function handleItemTouchStart(e) {
    clearTimeout(longPressTimer); 
    isDragging = false;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    let itemIndex = null;
    let viewType = null;
    let targetForMenu = null;
    const td = e.target.closest('td.col-word, td.col-meaning');
    if (td) {
        const row = td.closest('tr');
        if (row && row.dataset.index !== undefined) {
            itemIndex = parseInt(row.dataset.index, 10);
            viewType = 'wordlist';
            targetForMenu = row;
        }
    } else {
        const sentenceClickableArea = e.target.closest('.sentence-entry .headword, .sentence-entry .definition, .sentence-entry .example-sentence, .sentence-entry');
        if (sentenceClickableArea) {
            const entryDiv = sentenceClickableArea.closest('.sentence-entry');
            if (entryDiv && entryDiv.dataset.originalIndex !== undefined) {
                itemIndex = parseInt(entryDiv.dataset.originalIndex, 10);
                viewType = 'sentenceview';
                targetForMenu = entryDiv;
            }
        }
    }
    if (itemIndex !== null && !isNaN(itemIndex) && viewType) {
        longPressTimer = setTimeout(() => {
            if (!isDragging) {
                showContextMenu(touchStartX, touchStartY, itemIndex, viewType);
                if (navigator.vibrate) navigator.vibrate(50);
            }
            longPressTimer = null;
        }, LONG_PRESS_DURATION);
    }
}
function handleItemTouchMove(e) {
    if (longPressTimer) {
        const tx = e.touches[0].clientX;
        const ty = e.touches[0].clientY;
        const d = Math.sqrt(Math.pow(tx - touchStartX, 2) + Math.pow(ty - touchStartY, 2));
        if (d > 10) { 
            clearTimeout(longPressTimer);
            longPressTimer = null;
            isDragging = true;
        }
    }
}
function handleItemTouchEnd(e) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
}
function handleContextMenu(e) {
    let targetElement = null;
    let rowIndex = null;
    const td = e.target.closest('td.col-word, td.col-meaning');
    if (td) {
        const row = td.closest('tr');
        if (row && row.dataset.index !== undefined) {
            targetElement = row; 
            rowIndex = parseInt(row.dataset.index, 10);
        }
    } else {
        const sentenceEntry = e.target.closest('.sentence-entry');
        if (sentenceEntry && sentenceEntry.dataset.index !== undefined) {
            targetElement = sentenceEntry; 
            rowIndex = parseInt(sentenceEntry.dataset.index, 10);
        }
    }
    if (targetElement && !isNaN(rowIndex)) {
        e.preventDefault(); 
        showContextMenu(e.clientX, e.clientY, rowIndex); 
    } else {
        hideContextMenu(); 
        hideFolderContextMenu(); 
    }
}
function handleTouchStart(e) {
    clearTimeout(longPressTimer); 
    isDragging = false; 
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    let targetElement = null;
    let rowIndex = null;
    const td = e.target.closest('td.col-word, td.col-meaning');
    if (td) {
        const row = td.closest('tr');
        if (row && row.dataset.index !== undefined) {
            targetElement = row;
            rowIndex = parseInt(row.dataset.index, 10);
        }
    } else {
        const sentenceEntry = e.target.closest('.sentence-entry');
        if (sentenceEntry && sentenceEntry.dataset.index !== undefined) {
            targetElement = sentenceEntry;
            rowIndex = parseInt(sentenceEntry.dataset.index, 10);
        }
    }
    if (targetElement && !isNaN(rowIndex)) {
        longPressTimer = setTimeout(() => {
            if (!isDragging) { 
                showContextMenu(touchStartX, touchStartY, rowIndex); 
                if (navigator.vibrate) navigator.vibrate(50); 
            }
            longPressTimer = null; 
        }, LONG_PRESS_DURATION);
    }
}
function handleTouchMove(e) { if (longPressTimer) { const tx = e.touches[0].clientX; const ty = e.touches[0].clientY; const d = Math.sqrt(Math.pow(tx - touchStartX, 2) + Math.pow(ty - touchStartY, 2)); if (d > 10) { clearTimeout(longPressTimer); longPressTimer = null; isDragging = true; } } }
function handleTouchEnd(e) { clearTimeout(longPressTimer); longPressTimer = null; }
function hideContextMenu() {
    const cm = document.getElementById('context-menu');
    if (cm) {
        cm.style.display = 'none';
        delete cm.dataset.itemIndex; 
        delete cm.dataset.viewType;
    }
}
function showContextMenu(x, y, itemIndex, viewType) { 
    const cm = document.getElementById('context-menu');
    if (!cm || itemIndex === undefined || itemIndex === null || isNaN(itemIndex) || !viewType) {
        return;
    }
    hideContextMenu();
    hideFolderContextMenu();
    cm.dataset.itemIndex = itemIndex;
    cm.dataset.viewType = viewType;
    const entry = currentWords[itemIndex];
    if (!entry || typeof entry !== 'object') {
        console.error("컨텍스트 메뉴: 유효하지 않은 항목 데이터", itemIndex, entry);
        hideContextMenu();
        return;
    }
    const isReviewFolder = (currentFolderPath === "복습 절실");
    const canMoveToReview = !isReviewFolder;
    const canRestore = isReviewFolder && entry.originalPath;
    const editItem = cm.querySelector('#ctx-edit');
    const insertItem = cm.querySelector('#ctx-insert-above'); 
    const deleteItem = cm.querySelector('#ctx-delete');
    const moveReviewItem = cm.querySelector('#ctx-move-review');
    const moveOtherItem = cm.querySelector('#ctx-move-other');
    const restoreOriginItem = cm.querySelector('#ctx-restore-origin');
    const toggleSelectionModeItem = cm.querySelector('#ctx-toggle-selection-mode');
    if (editItem) editItem.parentElement.style.display = 'block';
    if (deleteItem) deleteItem.parentElement.style.display = 'block';
    if (moveOtherItem) moveOtherItem.parentElement.style.display = 'block';
    if (insertItem) insertItem.parentElement.style.display = 'block'; 
    if (moveReviewItem) moveReviewItem.parentElement.style.display = canMoveToReview ? 'block' : 'none';
    if (restoreOriginItem) restoreOriginItem.parentElement.style.display = canRestore ? 'block' : 'none';
    if (toggleSelectionModeItem) {
        toggleSelectionModeItem.parentElement.style.display = 'block'; 
        toggleSelectionModeItem.textContent = isInSelectionMode ? "선택 관리 종료" : "선택 관리 시작";
    }
    cm.style.visibility = 'hidden';
    cm.style.display = 'block';
    const menuWidth = cm.offsetWidth;
    const menuHeight = cm.offsetHeight;
    cm.style.display = 'none';
    cm.style.visibility = 'visible';
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    let left = x + scrollX;
    let top = y + scrollY;
    if (left + menuWidth > windowWidth + scrollX) {
        left = windowWidth + scrollX - menuWidth - 5;
    }
    if (top + menuHeight > windowHeight + scrollY) {
        top = y + scrollY - menuHeight - 5;
    }
    if (top < scrollY) {
        top = scrollY + 5;
    }
    if (left < scrollX) {
        left = scrollX + 5;
    }
    cm.style.left = `${left}px`;
    cm.style.top = `${top}px`;
    cm.style.display = 'block';
}
function handleContextMenuMoveToOther(event) { 
    event.preventDefault();
    const cm = document.getElementById('context-menu');
    const itemIndex = parseInt(cm?.dataset.itemIndex, 10);
    if (!isNaN(itemIndex)) {
        hideContextMenu();
        showFolderSelectModal((targetFolderPath) => {
            if (targetFolderPath) {
                 moveSingleWord(itemIndex, targetFolderPath);
            }
        });
    }
}
function handleContextMenuToggleSelectionMode(event) {
    event.preventDefault();
    hideContextMenu(); 
    if (isInSelectionMode) {
        cancelSelectionMode(); 
    } else {
        enterSelectionMode(); 
    }
}
async function moveSingleWord(index, targetPath) {
    if (!currentFolderPath || !targetPath || index === undefined || index < 0) {
        console.error("단일 이동 정보 부족", index, targetPath);
        return;
    }
    const wordToMove = currentWords[index];
    if (!wordToMove) return;
    if (confirm(`'${wordToMove.word || '[단어 없음]'}' 항목을 '${targetPath}' 폴더로 이동하시겠습니까?`)) {
         try {
            const response = await fetch('/api/words/move_multiple', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourcePath: currentFolderPath,
                    targetPath: targetPath,
                    wordIndices: [index] 
                }),
            });
            const data = await handleResponse(response);
            alert(data.message || `단어 이동 완료.`);
            currentWords = data.sourceWords || [];
            if (isSentenceModeActive) renderSentenceView(); else renderWordList();
        } catch (error) {
            handleError(error);
        }
    }
}
async function moveMultipleWords(targetPath, wordIndices) {
    if (!currentFolderPath || !targetPath || !wordIndices || wordIndices.length === 0) {
        console.error("다중 이동 정보 부족:", currentFolderPath, targetPath, wordIndices);
        return;
    }
    try {
        const response = await fetch('/api/words/move_multiple', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourcePath: currentFolderPath,
                targetPath: targetPath,
                wordIndices: wordIndices
            }),
        });
        const data = await handleResponse(response);
        alert(data.message || `${wordIndices.length}개 단어 이동 완료.`);
        currentWords = data.sourceWords || [];
        if (isSentenceModeActive) renderSentenceView(); else renderWordList();
        cancelSelectionMode(); 
    } catch (error) {
        handleError(error);
    }
}
function handleContextMenuEdit(event) {
    event.preventDefault();
    const cm = document.getElementById('context-menu');
    const itemIndex = parseInt(cm?.dataset.itemIndex, 10);
    if (!isNaN(itemIndex)) {
        hideContextMenu();
        editWord(itemIndex); 
    }
}
function handleContextMenuInsertAbove(event) {
    event.preventDefault();
    const cm = document.getElementById('context-menu');
    const itemIndex = parseInt(cm?.dataset.itemIndex, 10);
    if (!isNaN(itemIndex)) { 
        hideContextMenu();
        insertWordAbove(itemIndex); 
    } else {
        alert("항목 인덱스 오류입니다.");
        hideContextMenu();
    }
}
function handleContextMenuDelete(event) {
    event.preventDefault();
    const cm = document.getElementById('context-menu');
    const itemIndex = parseInt(cm?.dataset.itemIndex, 10);
    if (!isNaN(itemIndex)) {
        hideContextMenu();
        deleteWord(itemIndex);
    }
}
function handleContextMenuMoveToReview(event) {
    event.preventDefault();
    const cm = document.getElementById('context-menu');
    const itemIndex = parseInt(cm?.dataset.itemIndex, 10);
    if (!isNaN(itemIndex)) {
        hideContextMenu();
        moveWordToReview(itemIndex);
    }
}
function handleContextMenuRestoreOrigin(event) {
    event.preventDefault();
    const cm = document.getElementById('context-menu');
    const itemIndex = parseInt(cm?.dataset.itemIndex, 10);
    if (!isNaN(itemIndex)) {
        hideContextMenu();
        restoreWordFromReview(itemIndex);
    }
}
function insertWordAbove(index) {
    if (!currentFolderPath) { alert('삽입할 폴더 선택'); return; }
    if (index === undefined || isNaN(index) || index < 0 ) { alert('유효하지 않음'); return; }
    const nw = prompt('삽입 단어:');
    if (nw === null || nw.trim() === '') return;
    const nm = prompt('뜻:');
    if (nm === null || nm.trim() === '') return;
    const npos = prompt('품사 (선택사항, 예: n, v. 취소 시 빈 칸):', '');
    const newEntry = {
        word: nw.trim(),
        meaning: nm.trim(),
        part_of_speech: npos ? npos.trim() : null,
        entries: [],
        isStudied: false, 
        knowledgeState: 'unknown' // 기본 상태 추가
    };
    fetch('/api/words/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentFolderPath, index: index, ...newEntry }),
    })
    .then(handleResponse)
    .then(d => {
        currentWords = d.words;
        if (isSentenceModeActive) renderSentenceView(); else renderWordList();
    })
    .catch(handleError);
}
function moveWordToReview(index) {
    const reviewFolderPath = "복습 절실";
    if (!currentFolderPath) { alert('이동할 단어 폴더 선택'); return; }
    if (currentFolderPath === reviewFolderPath) { alert('이미 복습 폴더'); return; }
    if (index === undefined || isNaN(index) || index < 0 || index >= currentWords.length) { alert('유효하지 않음'); return; }
    moveSingleWord(index, reviewFolderPath); 
}
function restoreWordFromReview(index) { if (currentFolderPath !== "복습 절실") { alert('"복습 절실"에서만 사용'); return; } if (index === undefined || isNaN(index) || index < 0 || index >= currentWords.length) { alert('유효하지 않음'); return; } const wtr = currentWords[index]; if (!wtr || typeof wtr !== 'object' || !wtr.originalPath) { alert('원래 위치 정보 없음'); return; } const op = wtr.originalPath; if (confirm(`'${wtr.word || '[단어 없음]'}' 항목 원래 위치("${op}")로 복원?`)) { fetch('/api/words/restore_origin', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ wordIndex: index }), }).then(handleResponse).then(d => { currentWords = d.words; if(isSentenceModeActive) renderSentenceView(); else renderWordList(); }).catch(handleError); } }
function handleFolderContextMenuNewSubfolder(event) { event.preventDefault(); const cm = document.getElementById('folder-context-menu'); const pfp = cm?.dataset.folderPath; if (pfp) { hideFolderContextMenu(); createNewSubfolderUnder(pfp); } else { alert("상위 폴더 정보 없음."); } }
function createNewSubfolderUnder(parentPath) { const sn = prompt(`'${parentPath}' 아래 하위 폴더 이름:`); if (sn && sn.trim()) { const csn = sn.trim(); if (csn.includes('/')) { alert("폴더 이름에 / 사용 불가"); return; } fetch('/api/folder/sub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parent_path: parentPath, subfolder_name: csn }), }).then(handleResponse).then(d => { folders = d.folders; renderFolderTree(folders); }).catch(handleError); } }
function handleFolderEvent_Delegated(e) { switch (e.type) { case 'contextmenu': handleFolderContextMenu_Delegated(e); break; case 'touchstart': handleFolderTouchStart_Delegated(e); break; case 'touchmove': handleFolderTouchMove_Delegated(e); break; case 'touchend': case 'touchcancel': handleFolderTouchEnd_Delegated(e); break; } }
function handleFolderContextMenu_Delegated(e) { const tf = e.target.closest('.folder-name'); if (tf) { e.preventDefault(); const li = tf.closest('li.folder-item'); const fp = li?.dataset.folderPath; if (fp) showFolderContextMenu(e.clientX, e.clientY, fp); } else { hideFolderContextMenu(); } }
function handleFolderTouchStart_Delegated(e) { const tf = e.target.closest('.folder-name'); if (tf) { clearTimeout(folderLongPressTimer); isFolderDragging = false; folderTouchStartX = e.touches[0].clientX; folderTouchStartY = e.touches[0].clientY; const li = tf.closest('li.folder-item'); const fp = li?.dataset.folderPath; if (fp) { folderLongPressTimer = setTimeout(() => { if (!isFolderDragging) { showFolderContextMenu(folderTouchStartX, folderTouchStartY, fp); if (navigator.vibrate) navigator.vibrate(50); } folderLongPressTimer = null; }, LONG_PRESS_DURATION); } } }
function handleFolderTouchMove_Delegated(e) { if (folderLongPressTimer) { const tx = e.touches[0].clientX; const ty = e.touches[0].clientY; const d = Math.sqrt(Math.pow(tx - folderTouchStartX, 2) + Math.pow(ty - folderTouchStartY, 2)); if (d > 10) { clearTimeout(folderLongPressTimer); folderLongPressTimer = null; isFolderDragging = true; } } }
function handleFolderTouchEnd_Delegated(e) { clearTimeout(folderLongPressTimer); folderLongPressTimer = null; }
function showFolderContextMenu(x, y, folderPath) { const cm = document.getElementById('folder-context-menu'); if (!cm) return; hideContextMenu(); hideFolderContextMenu(); cm.dataset.folderPath = folderPath; cm.style.visibility = 'hidden'; cm.style.display = 'block'; const mw = cm.offsetWidth; const mh = cm.offsetHeight; cm.style.display = 'none'; cm.style.visibility = 'visible'; const ww = window.innerWidth; const wh = window.innerHeight; const sx = window.scrollX || window.pageXOffset; const sy = window.scrollY || window.pageYOffset; let l = x + sx; let t = y + sy; if (l + mw > ww + sx) l = ww + sx - mw - 5; if (t + mh > wh + sy) t = y + sy - mh - 5; if (t < sy) t = sy + 5; if (l < sx) l = sx + 5; cm.style.left = `${l}px`; cm.style.top = `${t}px`; cm.style.display = 'block'; }
function hideFolderContextMenu() { const cm = document.getElementById('folder-context-menu'); if (cm) { cm.style.display = 'none'; delete cm.dataset.folderPath; } }
function handleFolderContextMenuRename(event) { event.preventDefault(); const cm = document.getElementById('folder-context-menu'); const fp = cm?.dataset.folderPath; if (fp) { hideFolderContextMenu(); renameSpecificFolder(fp); } }
function handleFolderContextMenuDelete(event) { event.preventDefault(); const cm = document.getElementById('folder-context-menu'); const fp = cm?.dataset.folderPath; if (fp) { hideFolderContextMenu(); deleteSpecificFolder(fp); } }
function renameSpecificFolder(folderPath) { if (!folderPath) return; const cn = folderPath.split('/').pop(); const nn = prompt(`'${cn}' 새 이름:`, cn); if (nn && nn.trim() && nn.trim() !== cn) { fetch('/api/folder/rename', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_path: folderPath, new_name: nn.trim() }), }).then(handleResponse).then(d => { folders = d.folders; const rp = folderPath.substring(0, folderPath.lastIndexOf('/') + 1) + nn.trim(); if (folderPath === currentFolderPath) { currentFolderPath = rp; renderFolderTree(folders); selectFolder(currentFolderPath); } else { renderFolderTree(folders); document.querySelectorAll('#folderSidebar .folder-item').forEach(item => { item.classList.toggle('selected', item.dataset.folderPath === currentFolderPath); }); } }).catch(handleError); } }
function deleteSpecificFolder(folderPath) { if (!folderPath) return; const fn = folderPath.split('/').pop(); if (confirm(`'${fn}' 폴더와 하위 내용 모두 삭제?`)) { fetch(`/api/folder`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_path: folderPath }), }).then(handleResponse).then(d => { folders = d.folders; let fs = false; if (folderPath === currentFolderPath || (currentFolderPath && currentFolderPath.startsWith(folderPath + '/'))) { fs = true; currentFolderPath = null; currentWords = []; renderWordList(); renderSentenceView(); } renderFolderTree(folders); if (fs && folders && folders.length > 0) { const fp = getFirstValidPath(folders); if (fp) selectFolder(fp); } else if (currentFolderPath) { document.querySelectorAll('#folderSidebar .folder-item').forEach(item => { item.classList.toggle('selected', item.dataset.folderPath === currentFolderPath); }); } }).catch(handleError); } }
function handleClickOutsideMenus_Combined(event) { const wcm = document.getElementById('context-menu'); const fcm = document.getElementById('folder-context-menu'); if (wcm && wcm.style.display === 'block' && !wcm.contains(event.target)) { hideContextMenu(); } if (fcm && fcm.style.display === 'block' && !fcm.contains(event.target)) { hideFolderContextMenu(); } }
