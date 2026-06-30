# Forwarding Hub 개발 진행 현황 및 메모 (Forwarding Hub Development Progress & Memo)

- **작성일자:** 2026년 6월 30일
- **진행 단계:** 2차 고도화 완료 (선박 스케줄 관리 및 B/L 실시간 트래킹 위성 지도 연동 완료)

---

## 1. 🚀 오늘 완료된 핵심 고도화 작업 (Completed Tasks)

### 🚢 실시간 B/L 트래킹 & 태평양 중심 시뮬레이션 지도 연동
- **Leaflet 기반 프리미엄 다크 지도:** CartoDB Dark Matter 테마를 사용하여 야간 관제 센터 감성의 지도를 [DashboardPage.tsx](file:///home/gahz8212/forwarding-hub/frontend/src/pages/client/DashboardPage.tsx)에 성공적으로 연동했습니다.
- **태평양 중심 정렬 (Pacific-Centered View):** 동아시아(부산/상하이)에서 미국 서안(LA/롱비치)으로 가는 항로가 180도 날짜변경선을 건널 때, `getAdjustedCoords` 좌표 시프트 헬퍼를 도입하여 태평양이 화면 정중앙에 오도록 만들었습니다. 지도가 찢어지거나 아프리카로 우회하는 지리 기하학 오차를 원천 해결했습니다.
- **실시간 좌표 보간 및 전진 애니메이션:** 5초 주기로 `0.1% ~ 0.5%`씩 항해 진행률이 랜덤 누적 상승하며, 지도 새로고침 없이 🚢 선박 마커가 우측 미국을 향해 부드럽게 전진합니다. 초기 검색 로딩 시에는 `40% ~ 80%` 사이에서 랜덤하게 시작됩니다.
- **이모지 진행 방향 좌우 반전:** 선박 이모지(`🚢`)가 기본적으로 왼쪽을 바라보아 역방향(후진)으로 운항하는 것처럼 보이던 문제를 해결했습니다. 진행 방향(동쪽행)을 계산하여 내부 `div`에 CSS `transform: scaleX(-1)` 반전을 동적으로 처리했습니다. (Tailwind bounce 애니메이션과 충돌 방지를 위해 중첩 컨테이너 구조 설계 적용)
- **맵 제어 잠금 및 뷰포트 고정:** 지도가 너무 크거나 작게 틀어지지 않도록 드래그 이동, 마우스 휠 줌, 더블 클릭 줌, 모바일 터치 줌을 완전히 비활성화하고, 경로선이 뷰포트 중앙에 예쁘게 피팅되도록 잠금 처리했습니다.
- **리액트 DOM 재사용 맵 충돌 예방:** 컨테이너 `div`에 B/L 번호 기반의 고유 `key={trackingData.bl_number}`를 부여하여 B/L 번호 변경 시마다 맵 DOM 요소를 물리적으로 리빌드함으로써 Leaflet의 `Map container is already initialized` 중복 렌더링 에러를 영구 방지했습니다.

### 📊 7단계 마일스톤 고도화
- 실제 해상 수출 업무 흐름에 대응하도록 화물 단계를 **7단계**(`Booking Received` ➔ `Empty Release` ➔ `Document Closed` ➔ `Gate In` ➔ `Loaded on Vessel` ➔ `In Transit` ➔ `Arrived`)로 전면 개편하고 데이터베이스의 상태 인덱스와 1:1 매핑했습니다.
- 포워더 측([AdminShipmentPage.tsx](file:///home/gahz8212/forwarding-hub/frontend/src/pages/admin/AdminShipmentPage.tsx))에서 상태 업데이트 클릭 시, 소켓 통신을 타고 화주 대시보드로 실시간 동기화되어 즉각적인 화면 리로딩이 일어납니다.

### 💬 부킹별 사내 비밀 메모 & 실시간 대화방
- 화주와 포워더가 부킹별로 소통할 수 있는 실시간 문의 창구([BookingChatDrawer.tsx](file:///home/gahz8212/forwarding-hub/frontend/src/components/chat/BookingChatDrawer.tsx))를 구현했습니다.
- 포워더 사내 직원 전용의 `🔒 사내 비밀 메모` 기능을 제공하며, 황색 자물쇠 배지 말풍선으로 표기되어 화주에게 노출되지 않고 내부 업무 메모를 소켓으로 실시간 공유할 수 있습니다.
- 네이트온 공유용 텍스트 템플릿 복사 기능도 지원하여, 클릭 한 번으로 운임 및 운송 상세 상태를 카피해 메신저 단체방에 전달할 수 있습니다.

### 🎨 TailwindCSS 컴파일러 설정 복구
- `postcss.config.js`가 유실되어 Vite 컴파일 단계에서 Tailwind Directives가 씹혀 프리미엄 디자인이 흑백의 깨진 기본 텍스트로 보였던 문제를 파일 복구 및 빌드 파이프라인 수정을 통해 완벽하게 해결했습니다.

---

## 2. 📅 다음 구현 예정 작업 목록 (Roadmap)

1. **정산 및 인보이스(청구서) 실시간 연동**
   - 포워더 화면에서 해상 운임, 부대 비용 등 정산 항목 입력창 구현 및 DB 저장.
   - 포워더용 인보이스 발급 기능 및 화주 화면 실시간 결제 요청(카드 결제 모의 팝업 창 연동).
2. **수입(Import) 화물 프로세스 & D/O(화물인도지시서) 발급**
   - 수입 화물 전용 6단계 마일스톤 데이터 모델 수립.
   - Arrival Notice(수입화물도착통지서) 및 D/O Release(인도지시서 승인) 프로세스 구축.
3. **수출입신고필증 서류함 고도화**
   - 세관 시스템(UNI-PASS) 및 관세사 ERP의 특수성을 고려하여 포워더가 신고필증 PDF 및 15자리 통관부호를 대행하여 시스템에 입력/업로드하는 간소화된 통관 연동창 구축.
4. **실제 선박 스케줄 및 AIS 위치 추적 연동 (익일 작업 예정)**
   - 엑셀 파일 기반의 실제 선박 스케줄 데이터 파싱 및 DB 저장 로직 구현.
   - 현재 `init-db.ts` 스키마(`schedules`, `shipments` 테이블)에 누락된 선박 고유 식별자인 `imo_number` 컬럼 추가 (B/L-IMO 매핑용).
   - IMO 번호를 기반으로 한 실제 AIS 선박 위치 데이터 수집 연동.
     - **⚠️ 데이터 수집 방식 변경 논의:** 웹 스크래핑(크롤링) 방식은 봇 방어(Cloudflare)로 인한 접속 차단, 약관(ToS) 위반에 따른 IP 영구 밴, 타사 UI 변경 시 즉각적인 트래킹 장애(SPOF) 발생 등의 심각한 문제가 존재.
     - **💡 기술 스택 결정:** 스크래핑을 배제하고, 서비스의 안정성을 위해 Datalastic, Spire, MarineTraffic 등 **공식 AIS 위치 추적 API**를 도입하여 JSON 데이터를 연동하는 방식으로 개발 방향 확정.
