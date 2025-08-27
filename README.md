### 엔트리 블록 AST 구현 상태

#### 시작
- [x] `when_run_button_click` (시작하기 버튼을 클릭했을 때)
- [x] `when_mouse_click` (마우스를 클릭했을 때)
- [x] `when_mouse_click_cancel` (마우스 클릭을 해제했을 때)
- [x] `when_object_click` (오브젝트를 클릭했을 때)
- [x] `when_object_click_canceled` (오브젝트 클릭을 해제했을 때)
- [x] `when_message_cast` (신호를 받았을 때)
- [x] `when_scene_start` (장면이 시작되었을 때)
- [x] `when_clone_created` (복제본이 처음 생성되었을 때)
- [x] `when_some_key_pressed` (키보드를 눌렀을 때)

## 계산 블록 구현 현황

- [x] **`calc_basic`**: 10 + 10 (사칙연산: 덧셈, 뺄셈, 곱셈, 나눗셈)
- [x] **`calc_rand`**: 0 부터 10 사이의 무작위 수
- [x] **`coordinate_mouse`**: 마우스 포인터의 X 좌표 값 / Y 좌표 값
- [x] **`coordinate_object`**: (오브젝트)의 X좌표/Y좌표/회전각/이동방향/크기/모양번호/모양이름
- [x] **`quotient_and_mod`**: 10 을(를) 3 (으)로 나눈 몫 / 나머지
- [ ] **`get_project_timer_value`**: 타이머 값
- [ ] **`choose_project_timer_action`**: 타이머 시작하기 / 멈추기 / 초기화
- [ ] **`set_visible_project_timer`**: 타이머 보이기 / 숨기기
- [ ] **`calc_operation`**: 10 의 (제곱/제곱근/sin/cos 등)
- [x] **`get_date`**: 현재 년도/월/일/시/분/초 값
- [ ] **`distance_something`**: (마우스 포인터) 까지의 거리
- [ ] **`length_of_string`**: (엔트리)의 길이
- [ ] **`reverse_of_string`**: (엔트리)을(를) 거꾸로 뒤집은 값
- [ ] **`combine_something`**: (안녕) 와(과) (엔트리) 합치기 (문자열)
- [ ] **`char_at`**: (안녕하세요)의 (1)번째 글자
- [ ] **`substring`**: (안녕하세요)의 (2)번째 글자부터 (4)번째 글자까지
- [ ] **`count_match_string`**: (엔트리봇은 엔트리 작품을 좋아해)에서 (엔트리)가 포함된 개수
- [ ] **`index_of_string`**: (안녕하세요)에서 (하세)의 위치
- [ ] **`replace_string`**: (안녕하세요)의 (안녕)을(를) (Hi)로 바꾸기
- [ ] **`change_string_case`**: (Hello Entry!)을(를) (대문자/소문자)로 바꾸기
- [ ] **`get_block_count`**: (자신)의 블록 수 (오브젝트/장면/전체 블록 수 계산)
- [ ] **`change_rgb_to_hex`**: R (255) G (0) B (0) 값을 Hex 코드로 바꾸기
- [ ] **`change_hex_to_rgb`**: (#ff0000) 코드의 (R) 값
- [x] **`get_boolean_value`**: (판단 블록) 값 (결과를 "TRUE" 또는 "FALSE" 문자열로 반환)

### 구현불가

###### 개발자 가 서버를 구축안해서 못씁니다

- [ ] **`get_user_name`**: 사용자 아이디 (이것은 네이버 서버 전용 기능입니다)
- [ ] **`get_nickname`**: 사용자 닉네임 (이것은 네이버 서버 전용 기능입니다)

## 움직이기 블록 구현 현황

- [x] **`move_direction`**: (숫자) 만큼 (방향)으로 이동하기
- [x] **`bounce_wall`**: 화면 끝에 닿으면 튕기기
- [x] **`move_x`**: x좌표를 (숫자) 만큼 바꾸기
- [x] **`move_y`**: y좌표를 (숫자) 만큼 바꾸기
- [x] **`move_xy_time`**: (시간)초 동안 x, y 만큼 움직이기
- [ ] **`locate_x`**: x좌표를 (숫자)(으)로 정하기
- [ ] **`locate_y`**: y좌표를 (숫자)(으)로 정하기
- [x] **`locate_xy_time`**: (시간)초 동안 x: (숫자) y: (숫자) 위치로 이동하기 (원본 엔트리 에서 move_xy_time 하고 같은 구현으로 확인)
- [ ] **`locate_xy`**: x: (숫자) y: (숫자) 위치로 이동하기
- [x] **`locate`**: (오브젝트 또는 마우스 포인터) 위치로 이동하기
- [ ] **`locate_object_time`**: (시간)초 동안 (오브젝트 또는 마우스 포인터) 위치로 이동하기
- [x] **`rotate_relative`**: (각도) 만큼 회전하기
- [x] **`direction_relative`**: 이동 방향을 (각도) 만큼 회전하기 (같은코드)
- [x] **`rotate_by_time`**: (시간)초 동안 (각도) 만큼 회전하기
- [x] **`direction_relative_duration`**: (시간)초 동안 이동 방향을 (각도) 만큼 회전하기 (같은코드)
- [ ] **`rotate_absolute`**: 회전 각도를 (각도)(으)로 정하기
- [x] **`direction_absolute`**: 이동 방향을 (각도)(으)로 정하기
- [x] **`see_angle_object`**: (오브젝트 또는 마우스 포인터) 쪽 바라보기
- [x] **`move_to_angle`**: (각도) 방향으로 (숫자) 만큼 이동하기

## 모양새 블럭 구현

- [x] `show`: 엔티티를 보이도록 설정합니다.
- [x] `hide`: 엔티티를 숨기도록 설정합니다.
- [x] `dialog_time`: 지정된 시간 동안 말풍선/생각풍선을 표시합니다. (말하기, 생각하기 옵션 포함)
- [x] `dialog`: 말풍선/생각풍선을 표시합니다. (말하기, 생각하기 옵션 포함, 시간제한 없음)
- [x] `remove_dialog`: 표시된 말풍선/생각풍선을 제거합니다.
- [x] `change_to_some_shape`: 엔티티의 모양을 지정된 모양으로 변경합니다. (ID 또는 이름으로 모양 선택)
- [ ] `change_to_next_shape`: 엔티티의 모양을 다음 또는 이전 모양으로 변경합니다. (다음, 이전 옵션 포함)
- [ ] `add_effect_amount`: 엔티티에 그래픽 효과(색깔, 밝기, 투명도)를 지정된 값만큼 더합니다.
- [x] `change_effect_amount`: 엔티티의 그래픽 효과(색깔, 밝기, 투명도)를 지정된 값으로 설정합니다.
- [x] `erase_all_effects`: 엔티티에 적용된 모든 그래픽 효과를 제거합니다.
- [x] `change_scale_size`: 엔티티의 크기를 지정된 값만큼 변경합니다. (기존 크기에 더함)
- [x] `set_scale_size`: 엔티티의 크기를 지정된 값으로 설정합니다. (절대 크기)
- [ ] `stretch_scale_size`: 엔티티의 가로 또는 세로 크기를 지정된 값만큼 변경합니다. (너비, 높이 옵션)
- [ ] `reset_scale_size`: 엔티티의 크기를 원래대로 되돌립니다. (가로/세로 비율 포함)
- [x] `flip_x`: 엔티티를 상하로 뒤집습니다. (Y축 기준 반전)
- [x] `flip_y`: 엔티티를 좌우로 뒤집습니다. (X축 기준 반전)
- [ ] `change_object_index`: 엔티티의 그리기 순서를 변경합니다. (맨 앞으로 가져오기, 앞으로 가져오기, 뒤로 보내기, 맨 뒤로 보내기 옵션)

## 소리 블록 구현 상태

### 재생 관련

- [x] `sound_something_with_block`: 소리 재생하기 (예: '소리이름' 재생하기)
- [x] `sound_something_second_with_block`: 소리 (N)초 재생하기 (예: '소리이름' (N)초 재생하기)
- [x] `sound_from_to`: 소리 (시작)초부터 (끝)초까지 재생하기
- [x] `sound_something_wait_with_block`: 소리 재생하고 기다리기 (예: '소리이름' 재생하고 기다리기)
- [x] `sound_something_second_wait_with_block`: 소리 (N)초 재생하고 기다리기 (예: '소리이름' (N)초 재생하고 기다리기)
- [x] `sound_from_to_and_wait`: 소리 (시작)초부터 (끝)초까지 재생하고 기다리기

### 효과 및 제어

- [ ] `sound_volume_change`: 소리 크기를 (N)만큼 바꾸기
- [ ] `sound_volume_set`: 소리 크기를 (N)%로 정하기
- [ ] `get_sound_volume`: 소리 크기 값 (블록)
- [ ] `get_sound_speed`: 소리 재생 속도 값 (블록)
- [ ] `sound_speed_change`: 소리 재생 속도를 (N)만큼 바꾸기
- [ ] `sound_speed_set`: 소리 재생 속도를 (N)으로 정하기
- [ ] `sound_silent_all`: 모든 소리 끄기 (옵션: 모든 소리, 이 오브젝트의 소리, 다른 오브젝트의 소리)

### 배경음악

- [ ] `play_bgm`: 배경음악 재생하기 ('소리이름')
- [ ] `stop_bgm`: 배경음악 끄기

### 정보

- [ ] `get_sound_duration`: ('소리이름')의 재생 길이 (초) (블록)

## 변수/리스트 블록 구현

## 변수

- [ ] **`ask_and_wait` (묻고 기다리기)**: 사용자 입력 요청 및 대기
- [ ] **`get_canvas_input_value` (대답)**: 마지막 입력 값 가져오기
- [ ] **`set_visible_answer` (대답 보이기/숨기기)**: 대답 UI 토글
- [x] **`get_variable` (변수 값)**: 변수 값 가져오기
- [x] **`change_variable` (변수 값 바꾸기)**: 변수 값 변경 (덧셈/이어붙이기)
- [x] **`set_variable` (변수 값 정하기)**: 변수 값 설정
- [ ] **`show_variable` (변수 보이기)**: 변수 UI 표시
- [ ] **`hide_variable` (변수 숨기기)**: 변수 UI 숨김

## 리스트

- [ ] **`value_of_index_from_list` (리스트 항목 값)**: 특정 인덱스 항목 값 가져오기
- [ ] **`add_value_to_list` (리스트에 항목 추가)**: 맨 뒤에 항목 추가
- [ ] **`remove_value_from_list` (리스트에서 항목 삭제)**: 특정 인덱스 항목 삭제
- [ ] **`insert_value_to_list` (리스트에 항목 삽입)**: 특정 인덱스에 항목 삽입
- [ ] **`change_value_list_index` (리스트 항목 값 바꾸기)**: 특정 인덱스 항목 값 변경
- [ ] **`length_of_list` (리스트 길이)**: 리스트 항목 수 가져오기
- [ ] **`is_included_in_list` (리스트에 항목 포함 여부)**: 값 포함 여부 확인
- [ ] **`show_list` (리스트 보이기)**: 리스트 UI 표시
- [ ] **`hide_list` (리스트 숨기기)**: 리스트 UI 숨김

## 흐름 블록 구현

- [ ] wait_second (~초 기다리기)
- [x] repeat_basic (~번 반복하기)
- [x] repeat_inf (계속 반복하기)
- [x] repeat_while_true (~가 될 때까지/동안 반복하기)
- [x] stop_repeat (반복 중단하기)
- [ ] continue_repeat (반복 처음으로 돌아가기)
- [x] _if (만일 ~이라면)
- [x] if_else (만일 ~이라면, 아니면)
- [x] wait_until_true (~가 될 때까지 기다리기)
- [x] stop_object (모든/자신/다른/이 스크립트 멈추기)
- [ ] restart_project (처음부터 다시 실행하기)
- [x] **`start_scene`**: (장면) 시작하기
- [x] **`start_neighbor_scene`**: 이전/다음 장면 시작하기
- [x] when_clone_start (복제되었을 때)
- [x] create_clone (~의 복제본 만들기)
- [x] delete_clone (이 복제본 삭제하기)
- [ ] remove_all_clones (모든 복제본 삭제하기)

## 판단 블록 구현

- [ ] **`is_clicked`**: 마우스가 클릭되었는지 판단
- [ ] **`is_object_clicked`**: 특정 오브젝트가 클릭되었는지 판단
- [ ] **`is_press_some_key`**: 특정 키가 눌렸는지 판단
- [ ] **`reach_something`**: 특정 대상(벽, 마우스 포인터, 다른 오브젝트)에 닿았는지 판단
- [ ] **`is_type`**: 주어진 값의 타입(숫자, 영어, 한글)이 일치하는지 판단
- [x] **`boolean_basic_operator`**: 두 값의 관계(같음, 다름, 큼, 작음, 크거나 같음, 작거나 같음)를 판단
- [ ] **`boolean_and_or`**: 두 불리언 값에 대해 AND 또는 OR 연산을 수행
- [ ] **`boolean_not`**: 불리언 값에 대해 NOT 연산을 수행
- [ ] **`is_boost_mode`**: 현재 부스트 모드(WebGL 사용 여부)인지 판단
- [ ] **`is_current_device_type`**: 현재 장치 유형(데스크톱, 태블릿, 스마트폰)이 일치하는지 판단
## 구현불가
###### 미지원 기능
- [ ] **`is_touch_supported`**: 현재 장치가 터치를 지원하는지 판단

## 텍스트 블록 구현

- [ ] **`text_read`**: (글상자)의 글 내용
- [ ] **`text_write`**: (글상자)에 (내용) 쓰기
- [ ] **`text_append`**: (글상자)에 (내용) 이어 쓰기
- [ ] **`text_prepend`**: (글상자)에 (내용) 앞에 이어 쓰기
- [ ] **`text_change_effect`**: (글상자)에 (효과) (적용/해제)하기
- [ ] **`text_change_font`**: (글상자)의 글꼴을 (글꼴)로 바꾸기
- [ ] **`text_change_font_color`**: (글상자)의 글자 색을 (색)으로 바꾸기
- [ ] **`text_change_bg_color`**: (글상자)의 배경색을 (색)으로 바꾸기
- [ ] **`text_flush`**: (글상자)의 글 모두 지우기