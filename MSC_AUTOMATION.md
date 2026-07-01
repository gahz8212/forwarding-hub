# MSC 스케줄 자동 수집 파이프라인 (Node.js)

## 1. 개요
브라우저 자동화(스크래핑) 대신 MSC의 내부 API 엔드포인트를 직접 호출하여 안정적으로 스케줄 데이터를 확보하는 방식입니다.

## 2. API 정보
- **Endpoint:** `https://www.msc.com/api/feature/tools/SearchSailingRoutes`
- **Method:** `POST`
- **전략:** 브라우저 F12(Network 탭)에서 획득한 헤더와 Payload를 기반으로 호출.

## 3. 구현 로직 (msc_api.js)

```javascript
const axios = require('axios');

/**
 * MSC 스케줄 API 호출 모듈
 * @param {string} pol - 출발항 (예: 'KRINC')
 * @param {string} pod - 도착항 (예: 'CNSHA')
 */
async function fetchMscSchedule(pol, pod) {
    const url = 'https://www.msc.com/api/feature/tools/SearchSailingRoutes';
    
    // F12 Network 탭에서 복사한 헤더 세팅
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <토큰_값_여기에>', 
        'Referer': 'https://www.msc.com/ko/search-a-schedule'
    };

    const payload = {
        "origin": pol,
        "destination": pod,
        // 나머지 필드는 F12 Payload 탭 참고
    };

    try {
        const response = await axios.post(url, payload, { headers });
        return response.data; 
    } catch (error) {
        console.error(`[Error] ${pol} -> ${pod} 수집 실패:`, error.message);
        throw error;
    }
}
```
