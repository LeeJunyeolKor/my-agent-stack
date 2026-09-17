# 변경 기록

## 0.2.0

- `code-review`가 조사·판단을, `review-comment`가 이미 조사한 초안·게시를 담당한다. 기존에 review-comment로 리뷰 전체를 요청했다면 code-review를 사용한다.
- `terminology-review`를 `technical-writing`으로 확장했다. CLI의 구형 선택 이름은 새 이름으로 변환하고 경고한다. 구형 설치 폴더는 보존하므로 내용과 설치 영수증을 확인해 별도로 제거한다. 플러그인에는 새 이름만 포함된다.
- `report-writing`을 추가했다. evidence-first-delivery의 완료 판단 기준을 참조하며 집계와 문서 구성을 담당한다.
- 공통 지침 의존성은 선택형 설치에도 포함된다. 계획·프로필·영수증에 실제 포함된 스킬이 표시된다.
- `plugin-build`와 `plugin-verify`를 추가했다. `dist/codex`는 재생성 가능하며 Git에 넣지 않는다. 변경된 산출물 교체에는 `--yes --force`가 필요하다.
- CLI와 플러그인을 중복 설치하지 않도록 안내한다. 이번 버전은 로컬 마켓플레이스만 지원하며 원격 Git URL에서 미리 빌드된 플러그인을 직접 설치하는 기능은 제공하지 않는다.
- 기존 프로필 스키마와 `stackVersion: 0.1.0` 계약은 유지한다. 패키지·변경된 스킬·플러그인의 버전과 프로필 계약 버전은 별개다.
