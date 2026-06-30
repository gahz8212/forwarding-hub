# Zero-Call 디지털 포워딩 시스템 아키텍처

## 1. 데이터 흐름 (Core Pipeline)
화물의 추적은 `B/L 번호`를 마스터 키로 하여, 선박의 `IMO 번호`와 매핑되어 이루어집니다.

```mermaid
graph LR
    A[B/L 번호 입력] --> B{DB 매핑 조회}
    B -->|매핑 성공| C[IMO 번호 획득]
    C --> D[AIS 위치 API 호출]
    D --> E[지도 시각화]
    B -->|매핑 실패| F[선사/공공 API 연동]
    F --> C
