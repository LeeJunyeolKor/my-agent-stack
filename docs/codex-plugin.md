# Codex 플러그인 운영

하나의 `my-agent-stack` 플러그인과 `my-agent-stack-local` 로컬 마켓플레이스를 사용한다. 공개 디렉터리에 등록하거나 원격 저장소로 업로드하지 않아도 설치할 수 있다. 생성된 마켓플레이스 정책의 `ON_INSTALL`은 기본 메타데이터이며 이 패키지에는 인증 구성이나 연결 도구가 없다.

## 원본과 산출물

```text
skills/ + 각 manifest.json + catalog/codex-*.json
  → 기존 CLI의 plugin-build
  → dist/codex/.agents/plugins/marketplace.json
  → dist/codex/plugins/my-agent-stack/.codex-plugin/plugin.json
  → dist/codex/plugins/my-agent-stack/skills/
```

`skills/`가 유일한 원본이다. 플러그인 안의 복사본은 빌드 산출물이며 직접 수정하지 않는다. 참조용 구성 요소 스키마와 LICENSE도 포함한다. 허용 파일 목록에 없는 파일과 심볼릭 링크는 거부한다. 자동화·MCP·인증·hook은 패키징하지 않는다. 전체 카탈로그를 묶으므로 필수 외부 도구의 가용성은 각 스킬 실행 시 확인한다. 설치는 외부 권한을 부여하지 않는다.

## 최초 설치

Node.js 20 이상과 `plugin` 명령을 지원하는 Codex CLI가 필요하다. 명령은 작업 브랜치의 저장소 루트에서 실행한다.

```bash
npm run verify
npm run plugin:plan
npm run plugin:build
npm run plugin:verify
codex plugin marketplace add ./dist/codex
codex plugin add my-agent-stack@my-agent-stack-local
codex plugin list
```

마켓플레이스 등록은 개인 Codex 설정을 변경하는 로컬 설치 작업이다. 웹 게시가 아니다. 이 저장소는 기본 personal 마켓플레이스를 덮어쓰지 않는다. 위 명령은 명시적으로 생성한 저장소의 로컬 마켓플레이스를 등록한다.

현재 대화에는 설치 결과가 자동 반영된다고 가정하지 않는다. 새 Codex 작업에서 `$my-agent-stack:commit 커밋 메시지만 작성해줘`처럼 호출하고 실제로 읽은 스킬 경로와 수행한 작업을 확인한다.

## 업데이트

먼저 스킬 원본을 수정하고 검증한다. `plugin-build --dry-run`으로 대상과 포함 파일을 검토한 다음 산출물을 교체한다.

```bash
node bin/my-agent-stack.js plugin-build --dry-run
node bin/my-agent-stack.js plugin-build --yes --force
npm run plugin:verify
codex plugin add my-agent-stack@my-agent-stack-local
```

내용 해시가 버전의 build metadata에 들어가므로 같은 원본은 같은 패키지를 만들고, 원본이 바뀌면 다른 캐시 버전을 만든다. 재설치 뒤 새 작업을 연다. 마켓플레이스 JSON이나 Codex 설정을 수동으로 고치지 않는다. 경로를 옮겼다면 새 경로를 `codex plugin marketplace add`로 등록하고 등록 결과의 루트를 확인한다.

## 복구와 제거

수정 전 정상 커밋 또는 보관한 빌드 원본에서 다시 생성·검증한 후 재설치한다. 코드와 빌드 산출물의 일치 여부는 `plugin-verify`로 확인한다. 손상된 캐시만 제거하고 싶으면 아래 명령 후 정상 산출물에서 다시 설치한다.

```bash
codex plugin remove my-agent-stack@my-agent-stack-local
codex plugin add my-agent-stack@my-agent-stack-local
```

영구 제거 시 재설치 명령은 실행하지 않는다. 마켓플레이스도 제거하려면 현재 CLI의 `codex plugin marketplace remove --help`를 확인해 `my-agent-stack-local`만 제거한다. 다른 플러그인이나 사용자 설정을 초기화하지 않는다.

설치된 플러그인은 Codex 캐시에 있지만 업데이트를 위해 등록한 `dist/codex` 경로를 보존해야 한다. 워크트리를 지우기 전 유지할 작업 체크아웃에서 빌드한 새 경로를 등록한다.

## 기존 CLI와 함께 사용할 때

선택형 CLI는 필요한 스킬과 공통 지침을 에이전트 폴더에 직접 복사한다. 플러그인은 전체 스킬을 Codex가 캐시에 설치한다. 둘은 같은 원본의 대안이며 두 번 설치할 필요가 없다. 기존 직접 설치는 `.my-agent-stack/receipt.json`과 실제 파일을 대조한 뒤 사용자가 수정한 내용이 없는지 확인하고 정리한다. CLI는 구형 폴더를 자동 삭제하지 않는다.

조직 플러그인과 함께 사용할 때는 플러그인까지 포함한 한정 이름을 사용한다. 식별자 충돌이 없더라도 “리뷰해줘” 같은 자연어 요청은 설명이 겹칠 수 있다. 다른 플러그인을 임의로 비활성화하지 말고 실제 선택 결과를 새 작업에서 확인한다.

검증 범위와 한계는 [검증 계약](verification.md)을 따른다. 플러그인 목록의 설치 표시만으로 스킬 호출 성공을 판단하지 않는다.
