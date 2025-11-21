// back/prompts.js

/**
 * 1. 텍스트 구조화 프롬프트 (기존과 동일)
 */
const PDF_TXT_EXTRACTION_PROMPT = `
당신은 특수교육/통합교육 학생 활동 기록을 전문적으로 분석하고 구조화하는 데이터 처리 엔진입니다. 
입력된 원본 텍스트(raw text)를 분석하여 아래 JSON 스키마에 맞는 활동 기록 레코드 배열로 변환해 주세요.

**[지침]**
1. 출력은 오직 **유효한 JSON**이어야 합니다. (Markdown 코드 블록 없이 순수 JSON만 반환)
2. **데이터 분리**: 텍스트에 여러 날짜나 활동이 섞여 있다면, 의미 단위로 나누어 \`records\` 배열에 담으세요.
3. **보수적 추론**: 날짜나 학생 이름이 명확하지 않으면 \`null\`로 두세요. 없는 내용을 지어내지 마세요.
4. **필드 값 규칙**:
   - \`activity_type\`: [자유놀이, 미술활동, 등교/하교, 급식/간식, 체육활동, 개별지도, 그룹수업, 전이/휴식, 기타] 중 택 1
   - \`level\`: [매우 우수, 우수, 보통, 도전적] 중 택 1 (ability_analysis 내부)
   - \`intensity\`: 1~5 (emotions 내부)

**[입력 텍스트]**
{raw_text}

**[출력 JSON 스키마]**
{
  "records": [
    {
      "student_name": "string | null",
      "date": "YYYY-MM-DD | null",
      "activity_title": "string",
      "activity_type": "string",
      "time_range": "string | null",
      "raw_activity_text": "string (해당 활동 관련 원본 문장)",
      "ability_analysis": {
        "main_abilities": ["string", "string"],
        "level": "string",
        "comment": "string (능력 관련 짧은 평가)"
      },
      "emotions": [
        { "label": "string", "intensity": 1-5, "reason": "string" }
      ],
      "behavior_tags": ["string"],
      "teacher_comment": "string (교사용 요약)"
    }
  ]
}
`;

/**
 * 2. 리포트 프롬프트 생성기 (4가지 카테고리 대응)
 */
const GET_REPORT_PROMPT = (category, purpose, tone) => {
  // 공통 기본 지침
  const baseInstruction = `
당신은 특수교육 전문가입니다. 입력된 통계 데이터와 활동 샘플을 바탕으로 **Markdown 형식**의 리포트를 작성해 주세요.
**[작성 지침]**
1. **형식**: Markdown (제목 #, 소제목 ## 사용).
2. **톤앤매너**: 목적은 '${purpose}', 어조는 '${tone}'입니다.
3. **데이터 준수**: 입력된 JSON 데이터에 기반해서만 서술하세요. 추측성 서술은 지양하세요.
  `;

  let specificInstruction = "";
  let structureGuide = "";

  // 카테고리 문자열 공백 제거 및 정규화 (매칭 오류 방지용)
  const safeCategory = category ? category.trim() : "전체 리포트";

  switch (safeCategory) {
    case "감정 변화":
      specificInstruction = `
**[분석 초점: 감정 변화]**
- 기간 동안 학생의 정서적 흐름(안정감, 불안 등)이 어떻게 변화했는지 분석하세요.
- 특정 활동이나 시간대, 환경 요인(Trigger)과 감정의 상관관계를 파악하세요.
- 긍정적 감정이 나타난 사례와 부정적 감정이 해소된 과정을 중점적으로 서술하세요.
      `;
      structureGuide = `
# 1. 감정 변화 요약
# 2. 주요 감정 흐름 분석
(기간 초반 vs 후반 변화 등)
# 3. 감정 유발 요인 (Trigger) 및 반응
# 4. 정서적 안정을 위한 제언
# 5. 마무리
      `;
      break;

    case "활동 유동 변화":
      specificInstruction = `
**[분석 초점: 활동 유동 변화]**
- 학생의 활동 참여 패턴이 어떻게 변화했는지(특정 활동 집중, 다양성 증가 등) 분석하세요.
- 활동의 전환(전이) 과정에서의 적응도와 유연성을 평가하세요.
- 선호 활동과 비선호 활동 간의 참여 시간 변화 추이를 서술하세요.
      `;
      structureGuide = `
# 1. 활동 패턴 요약
# 2. 활동 유형별 참여 변화
(시간 비중 변화, 새로운 활동 시도 등)
# 3. 활동 전이 및 참여 태도 분석
# 4. 활동 다양성 증진을 위한 제언
# 5. 마무리
      `;
      break;

    case "활동 능력 변화":
      specificInstruction = `
**[분석 초점: 활동 능력 변화]**
- 활동 수행 수준(매우 우수~도전적)의 변화 추이를 분석하세요.
- 이전에 어려워했던(도전적) 활동에서 성취를 보인 '성장 사례'를 찾으세요.
- 영역별(인지, 운동, 사회성 등) 능력 발달의 불균형이나 특이점을 서술하세요.
      `;
      structureGuide = `
# 1. 능력 성장 요약
# 2. 영역별 수행 능력 변화 추이
(성취도가 향상된 영역 위주)
# 3. 주요 성취 사례 (Success Story)
# 4. 향후 발달 목표 및 지도 방안
# 5. 마무리
      `;
      break;

    case "전체 리포트":
    default:
      specificInstruction = `
**[분석 초점: 종합 보고서]**
- 학생의 학교생활 전반(감정, 행동, 학습, 사회성)을 균형 있게 요약하세요.
- 강점 위주로 서술하되, 지원이 필요한 부분도 명확히 명시하세요.
- 모든 영역(감정, 활동, 능력)을 아우르는 통합적 관점을 유지하세요.
      `;
      structureGuide = `
# 1. 기본 정보
# 2. 전체 개요
# 3. 강점과 긍정적 변화
# 4. 도움이 필요한 영역
# 5. 감정 및 행동 패턴
# 6. 활동별 능력 분석
# 7. 지원 제안 및 다음 단계
# 8. 마무리 문장
      `;
      break;
  }

  return `
${baseInstruction}

${specificInstruction}

**[입력 데이터]**
{input_json}

**[출력 리포트 목차 구조]**
${structureGuide}
  `;
};

module.exports = {
  PDF_TXT_EXTRACTION_PROMPT,
  GET_REPORT_PROMPT,
};