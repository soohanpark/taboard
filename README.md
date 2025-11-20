# Taboard

Manifest V3 기반 Tabextend 스타일 새 탭(New Tab) 확장 프로그램입니다. 좌측 호버 패널에는 현재 브라우저 탭 목록이 나타나며, 우측 메인 영역에는 공간(Space)별 칸반 보드/섹션/카드(링크·노트·할 일)를 무제한으로 추가할 수 있습니다. 탭을 칸반 카드로 드래그 & 드롭하거나, 보드에 있는 링크를 한 번에 열 수 있으며, Google Drive 백업/복원도 UI 상에서 진행합니다.

## 구성

```
.
├── background.js        # MV3 서비스 워커 (헬퍼 이벤트)
├── icons/               # 기본 아이콘
├── manifest.json        # MV3 설정 + tabs/identity 권한
└── newtab/
    ├── index.html       # 좌측 탭 패널 + 칸반 레이아웃/모달
    ├── style.css        # tabextend 유사 라이트 테마 스타일
    ├── app.js           # UI 상태, 드래그, Drive/탭 이벤트
    ├── state.js         # 상태/초기 데이터/업데이트 유틸
    ├── storage.js       # chrome.storage 래퍼
    └── drive.js         # Google Drive OAuth + 파일 업로드/다운로드 모듈
```

## Google Drive 연동 준비

1. [Google Cloud Console](https://console.cloud.google.com/)에서 **Chrome 앱** 유형의 OAuth Client ID 를 발급합니다.
2. Drive API 를 활성화하고 승인된 리디렉션 URI 에 `https://<extension_id>.chromiumapp.org/` 를 추가합니다. (확장 프로그램 로드 후 `chrome://extensions` → ID 확인)
3. 발급한 Client ID 로 `manifest.json` 의 `oauth2.client_id` 값을 교체합니다.
4. 새 탭의 **Google Drive 연결** 버튼을 누르면 Chrome OAuth 창이 열리고, 로그인/승인 후 자동으로 연동이 완료됩니다.

## 주요 기능

- 좌측 호버 패널에서 현재 창의 탭 목록 확인/검색/닫기 + 탭을 보드로 드래그해 링크 카드로 저장
- Space → Column(무제한) → Card(링크·노트·할 일) 구조
- 카드 드래그 앤 드롭/즐겨찾기/완료 토글 + 링크 카드는 본문 클릭 시 바로 열기
- Space/Column/카드 추가/편집/삭제 모달
- Column 헤더의 `sites` 버튼으로 해당 보드의 링크를 한 번에 새 창(그룹)으로 열기
- 단축키 `⌘/Ctrl + K` 로 카드 검색어 입력
- Google Drive 파일(`TaboardSync.json`)로 자동 백업/복원 (칸반 보드 데이터만 업로드, 5분 간격 백그라운드 동기화 포함)
- Snackbar, 글래스모피즘 기반 애니메이션, GitHub 푸터 링크

## 개발/테스트

1. `chrome://extensions/` → **Developer mode** 활성화 → **Load unpacked** 로 이 디렉터리를 로드합니다.
2. (선택) Google Drive 연동을 테스트하려면 위 절차대로 OAuth Client ID 를 준비한 뒤 새 탭의 모달에서 입력·로그인합니다.
3. 새 탭을 열어 tabextend 스타일 보드/탭 패널/드라이브 연동을 직접 검증합니다.

필요한 세부 기능(예: 추가 카드 타입, 공유, 단축키 확장 등)은 `newtab/` 내 모듈에 자유롭게 추가하세요.
