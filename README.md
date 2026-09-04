# My Agent Stack

AI 에이전트와 함께 일할 때 사용하는 스킬, 자동화 레시피, 환경 선택지를 모은 이식 가능한 카탈로그입니다.

이 저장소는 개인 포트폴리오이면서 실제로 동작하는 선택형 설치 도구입니다. 반복 업무를 증거 범위가 명확한 재사용 가능한 에이전트 워크플로로 바꾸되, 핵심 구조가 특정 회사나 도구 공급자에 종속되지 않도록 설계한 방식을 보여줍니다.

> 버전 0.1은 로컬 Agent Skills와 비활성화된 자동화 레시피를 설치합니다. 프로바이더 항목은 구성 선택지일 뿐 실제 커넥터가 아니며, 이 설치 도구는 어떤 레시피도 예약하거나 활성화하지 않습니다.

<a id="what-this-demonstrates"></a>
## 이 저장소가 보여주는 것

- 워크플로는 특정 이슈 트래커 같은 제품이 아니라 필요한 기능에 의존합니다.
- 에이전트, 프로바이더, 스킬, 자동화, 설치 범위를 각각 선택할 수 있습니다.
- dry-run에서 제외되는 모듈, 축소되는 동작, 필요한 권한, 설치 위치를 미리 확인할 수 있습니다.
- 명시적으로 교체를 요청하지 않는 한 기존 구성을 보존합니다.
- 검증 상태와 구현·머지·배포·런타임 동작 여부에 관한 주장을 서로 구분합니다.
- 공개 모듈은 독립적으로 작성하고 공개에 맞게 정제하며, 조직 내부 맥락은 로컬에만 둡니다.

<a id="catalog"></a>
## 카탈로그

<a id="skills"></a>
### 스킬

| 스킬 | 해결하는 문제 | 포트폴리오에서 보여주는 역량 |
| --- | --- | --- |
| `evidence-first-delivery` | 전달 보고서가 현재 증거로 확인할 수 있는 범위보다 과장되는 문제 | 증거의 경계 설정과 알 수 없는 항목의 명시 |
| `environment-onboarding` | 개인 워크플로가 한 조직에 종속되는 문제 | 기능 매핑과 개인정보 보호를 고려한 이식성 |
| `portable-stack-audit` | 설치된 확장 기능에 자체 제작물, 서드파티 자료, 비공개 자료가 섞이는 문제 | 출처 추적과 공개 안전성 분류 |
| `commit` | 크거나 추측에 기반한 커밋을 검토하기 어려운 문제 | diff 기반 변경 묶음과 hook을 고려한 검증 |
| `fallback-guide` | 기능 저하 상황에서 명시적인 운영 계약이 없는 문제 | 실패 조건, 관측 가능성, 검증 방식 |
| `pull-request` | PR 설명이 실제 변경 사항과 달라지는 문제 | 증거에 근거한 변경 설명 |
| `review-comment` | 리뷰 피드백에 결함과 선호가 뒤섞이는 문제 | 계약과 위험을 연결하는 판단, 최소 수정 제안 |
| `terminology-review` | 용어 혼용으로 한국어 기술 문서의 가독성이 낮아지는 문제 | 맥락을 고려한 언어 일관성 |
| `ticket-status` | 이슈 상태가 소스 제어 증거와 어긋나는 문제 | 특정 프로바이더에 종속되지 않는 상태 전이 판단 |

<a id="automation-recipes"></a>
### 자동화 레시피

| 레시피 | 필요한 기능 | 설치 후 동작 |
| --- | --- | --- |
| `daily-work-summary` | `scm.history.read` | 비활성 상태로 복사되며, 이슈와 메시징 맥락은 선택 사항 |
| `post-merge-verification` | `scm.pull-request.read` | 비활성 상태로 복사되며, 배포 성공을 추론하지 않음 |
| `issue-status-sync` | SCM 브랜치 읽기와 이슈 읽기/쓰기 | 이슈 프로바이더가 없으면 제외되며, 실제 변경에는 별도의 승인이 필요 |

<a id="agent-targets"></a>
### 에이전트 대상

이 스택은 각 제품이 문서화한 Agent Skills 폴더를 사용하며, 동작 호환성 상태를 명시적으로 관리합니다.

| 에이전트 | 프로젝트 범위 스킬 위치 | 사용자 범위 스킬 위치 |
| --- | --- | --- |
| Codex | `.agents/skills` | 지정한 사용자 루트 아래 `.agents/skills` |
| Claude Code | `.claude/skills` | 지정한 사용자 루트 아래 `.claude/skills` |
| Cursor | `.agents/skills` | 지정한 사용자 루트 아래 `.agents/skills` |
| Gemini CLI | `.agents/skills` | 지정한 사용자 루트 아래 `.agents/skills` |
| Antigravity IDE | `.agents/skills` | 지정한 사용자 루트 아래 `.gemini/config/skills` |
| Antigravity CLI | `.agents/skills` | 지정한 사용자 루트 아래 `.gemini/antigravity-cli/skills` |

여러 에이전트가 의도적으로 `.agents/skills`를 공유하므로, 선택한 스킬 하나는 해당 위치에 한 번만 복사됩니다. 실제 동작 검증 결과가 기록되기 전까지 카탈로그의 대상 상태는 `unverified`입니다.

<a id="try-it"></a>
## 사용해 보기

Node.js 20 이상이 필요하며 별도의 패키지 의존성은 없습니다.

```bash
git clone https://github.com/LeeJunyeolKor/my-agent-stack.git
cd my-agent-stack
npm run verify
node ./bin/my-agent-stack.js list
```

GitHub를 사용하지만 이슈 트래커는 사용하지 않는 Codex 및 Cursor 구성을 미리 확인합니다.

```bash
node ./bin/my-agent-stack.js plan \
  --agents codex,cursor \
  --skills evidence-first-delivery,environment-onboarding \
  --automations daily-work-summary,issue-status-sync \
  --providers scm=github,issues=none,messaging=none \
  --target /path/to/existing/project
```

이 계획은 두 스킬을 에이전트가 공유하는 디렉터리에 한 번만 설치하고, 일일 요약 레시피는 선택적 부가 맥락 없이 축소된 형태로 설치합니다. 이슈 프로바이더를 선택하지 않았으므로 `issue-status-sync`는 명시적으로 제외합니다.

출력된 계획을 검토한 뒤 명시적으로 적용합니다.

```bash
node ./bin/my-agent-stack.js install \
  --profile ./profiles/examples/github-no-issues.json \
  --target /path/to/existing/project \
  --yes
```

단계별 선택 과정을 사용하려면 터미널에서 다음 명령을 실행합니다.

```bash
node ./bin/my-agent-stack.js init
```

설치하면 `.my-agent-stack/` 아래에 로컬 프로필과 checksum 영수증이 기록됩니다. 동일한 설치를 다시 실행하면 아무 변경도 일어나지 않습니다. 기존 내용이 다르면 충돌로 처리되며, 설치 위치를 검토한 뒤 `--force`를 명시한 경우에만 교체할 수 있습니다.

<a id="portable-model"></a>
## 이식 가능한 모델

```text
이식 가능한 스킬 + 자동화 레시피
                 │ 필요한 기능 요청
                 ▼
          선택한 프로바이더 프로필
                 │ 해결하거나 제외
                 ▼
            결정론적 설치 계획
                 │ 명시적 확인
                 ▼
 에이전트 스킬 경로 + 비활성 레시피 + checksum 영수증
```

회사를 옮길 때는 핵심 워크플로를 수정하는 대신 새 프로필을 선택하면 됩니다. 구성에 따라 GitHub, GitLab, Bitbucket, 로컬 Git 중 하나를 선택할 수 있고, 이슈 관리 도구로 Jira, Linear, 저장소 이슈, Notion 또는 사용 안 함을 선택할 수 있습니다. 메시징 프로바이더 역시 Slack, Teams 또는 사용 안 함 중에서 고를 수 있습니다.

공개 ID는 중립적인 기능 이름을 사용합니다. 비공개 프리픽스(prefix), 내부 식별자, 원본 경로, 특정 회사에 종속된 매핑은 과거 메타데이터로 남기지 않고 제거합니다. 자세한 내용은 [이식성과 이름 규칙](docs/portability.md)을 참고하세요.

<a id="commands"></a>
## 명령어

```text
my-agent-stack list [--json]
my-agent-stack init
my-agent-stack plan --profile <profile.json> [--target <directory>]
my-agent-stack install --profile <profile.json> --target <directory> --yes
my-agent-stack validate
my-agent-stack doctor
```

`doctor`는 카탈로그 구조를 검증하고 공개 체크아웃에서 일반적인 비밀정보, 비공개 경로, 내부 도메인, 티켓 식별자 패턴을 검사합니다. 더 강한 로컬 검사가 필요하면 Git에서 무시되는 `.my-agent-stack-denylist`에 비공개 표식을 추가하세요.

<a id="design-documents"></a>
## 설계 문서

- [아키텍처](docs/architecture.md)
- [이식성과 중립적 이름 규칙](docs/portability.md)
- [보안 경계](docs/security.md)
- [검증 계약](docs/verification.md)
- [ADR 0001](docs/adr/0001-portable-catalog-and-installer.md)

<a id="roadmap"></a>
## 로드맵

- 독립적인 동작 검증을 기록하고, 증거가 확보된 대상의 호환성 상태만 선별적으로 높입니다.
- 자격 증명을 저장하지 않는 선택형(opt-in) 프로바이더 어댑터를 추가합니다.
- 공유 스킬 소스에서 에이전트별 플러그인 패키지를 생성합니다.
- 설치 미리 보기와 활성화를 분리하는 스케줄러 어댑터를 추가합니다.
- 기계가 읽을 수 있는 카탈로그와 영수증을 My Workbench로 내보냅니다.

<a id="license"></a>
## 라이선스

MIT 라이선스를 따릅니다. 각 카탈로그 구성 요소도 `manifest.json`에 출처와 라이선스를 명시합니다.
