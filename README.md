# 도형추리 트레이너

인적성 도형추리·공간지각(입체 회전) 대비 웹앱. 기획: [PLAN.md](PLAN.md)

```
npm install
npm run dev     # 개발 서버 http://localhost:5173
npm test        # 엔진 단위 테스트 (Vitest)
npm run build   # 정적 사이트 빌드 (dist/)
```

## 구조
- `src/engine/` 순수 TS 변환 엔진 (렌더링과 분리, 모든 정답은 여기서 계산)
  - `solids.ts` 5종 정다면체 (면 = 정다각형, 면별 기호 위쪽 upRef)
  - `rotation.ts` 시험식 회전 명령 ↔ 축/각도, 회전대칭군(12/24/24/60/60), 스냅
  - `state.ts` 자세 + 거울상, 라벨, 슬롯별 모습(Look)과 시그니처
  - `net.ts` 전개도: 신장 트리, 펼침 변환, 2D 배치, 겹침 검사, 프리셋 11종
  - `radial/` 평면 방사형(다트판형) 도형과 연산
  - `rules.ts` 번호 규칙 세트 랜덤 생성 / `question.ts` 문제 유형 1~10 + 오답 보기
- `src/render/` SVG 썸네일·애니메이션, three.js(R3F) 3D
- `src/features/` 샌드박스 / 문제풀이 / 실전모드 / 오답노트 / 통계 / 설정
