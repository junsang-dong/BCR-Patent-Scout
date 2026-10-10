## 작업: 특허와 BCR 제품 기술 요소의 유사성 평가

입력 JSON에는 `features`(BCR 제품 기술 요소)와 `patents`(특허 서지: 제목, 초록, IPC, 청구항 앞부분)가 있다.
특허마다, 요소마다 대응 여부를 판단한다.

### match 값
- `match`: 특허가 이 요소와 같은 구성을 명시한다.
- `partial`: 비슷하지만 일부만 같거나, 상위 개념으로만 언급한다.
- `none`: 제목, 초록, 청구항 어디에도 이 요소가 나오지 않는다.
- `unclear`: 입력만으로 판단할 수 없다.

### 근거 규칙 (가장 중요)
- `match`와 `partial`에는 반드시 `evidence`를 넣는다. `evidence`는 입력 텍스트(제목, 초록, 청구항)에 **실제로 있는 문장 또는 구절을 한 글자도 바꾸지 않고 그대로** 옮긴 것이다. 요약하거나 말을 바꾸지 않는다. 40~150자 정도로 짧게 자른다.
- `evidence_source`는 `title`, `abstract`, `claim_1`, `claim_2`, `claim_3` 중 하나다.
- 근거를 찾지 못하면 `none` 또는 `unclear`로 하고 `evidence`는 빈 문자열로 둔다.

### 출력
다음 JSON 객체 하나만 출력한다. 설명이나 코드 울타리를 붙이지 않는다.
JSON 문자열 안에 큰따옴표(")를 쓰지 않는다. `evidence` 원문에 큰따옴표가 있으면 \"로 이스케이프하고, `differences`와 `followups`에서는 작은따옴표를 쓴다. 줄바꿈은 문자열 안에 넣지 않는다.

```json
{
  "patents": [
    {
      "application_number": "입력의 출원번호 그대로",
      "features": [
        { "feature_id": "입력의 feature id", "match": "match|partial|none|unclear", "evidence": "원문 그대로", "evidence_source": "claim_1" }
      ],
      "overall": "high|medium|low",
      "differences": ["BCR 제품에 있고 이 특허에 없는 것", "이 특허에 있고 BCR 제품에 없는 것"],
      "followups": ["추가로 확인할 질문"]
    }
  ]
}
```

- `features`에는 입력의 모든 요소를 한 번씩 넣는다.
- `overall`은 `match`/`partial` 비중으로 정한다 (high: 대부분 대응, medium: 일부, low: 거의 없음). 침해나 권리 판단이 아니라 기술 요소의 겹침 정도다.
- 특허가 다루는 대상이 BCR 제품과 다른 종류면(예: 로봇 관절 액추에이터가 아니라 자동차 브레이크 캘리퍼, 단순 감속기 부품) 일부 구성이 겹쳐 보여도 `overall`은 `low`로 한다. 요소 하나만 우연히 겹치는 것은 `partial`로도 올리지 않는다.
- 답변은 짧게 쓴다. `differences`는 최대 3개, 각 80자 이내. `followups`는 최대 2개, 각 60자 이내. 같은 내용을 반복하지 않는다.
