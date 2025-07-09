# app.py (통합 데이터 구조 버전)

from flask import Flask, render_template, request, jsonify, Response
from flask_cors import CORS
from google.cloud import texttospeech
from google.oauth2 import service_account 
import json
import os
import random
import io
import copy # <<< deepcopy를 위해 추가
import traceback
from google.api_core import exceptions as google_exceptions
import csv # CSV 파싱 위해 추가

app = Flask(__name__)
CORS(app)

# --- 경로 설정 ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_FILE = os.path.join(BASE_DIR, "static", "defaults", "default_vocabulary.json") # 기본 데이터
USER_DATA_FILE = os.path.join(BASE_DIR, "vocabulary_data.json") # 사용자 데이터
KEYFILE_NAME = "wired-benefit-429414-m5-09d515d26cf5.json" # 실제 키 파일 이름으로 변경
KEYFILE_PATH = os.path.join(BASE_DIR, KEYFILE_NAME)
# --- 경로 설정 끝 ---

# --- 전역 변수 선언 ---
default_folders = {} # 기본 데이터 (읽기 전용)
user_folders = {}    # 사용자 데이터 (읽기/쓰기)


# --- Google Cloud TTS 클라이언트 초기화 (Render 환경 최적화) ---
tts_client = None

try:
    # 1. Render 환경에서는 이 환경 변수가 반드시 존재해야 합니다.
    credentials_json_str = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS_JSON')

    if credentials_json_str:
        # Render 환경: 환경 변수에서 인증 정보 로드
        print("[백엔드 로그] GOOGLE_APPLICATION_CREDENTIALS_JSON 환경 변수를 발견했습니다. 로드를 시도합니다.")
        credentials_info = json.loads(credentials_json_str)
        credentials = service_account.Credentials.from_service_account_info(credentials_info)
        tts_client = texttospeech.TextToSpeechClient(credentials=credentials)
        print("[백엔드 로그] TTS 클라이언트 초기화 성공 (환경 변수 사용).")
    else:
        # 로컬 개발 환경: 파일 시스템에서 인증 정보 로드
        print("[백엔드 로그] GOOGLE_APPLICATION_CREDENTIALS_JSON 환경 변수가 없습니다. 로컬 파일 시스템에서 인증을 시도합니다.")
        if os.path.exists(KEYFILE_PATH):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = KEYFILE_PATH
            tts_client = texttospeech.TextToSpeechClient()
            print("[백엔드 로그] TTS 클라이언트 초기화 성공 (로컬 파일 사용).")
        else:
            print(f"[백엔드 로그][경고] TTS 인증 실패: 로컬 키 파일({KEYFILE_PATH})을 찾을 수 없습니다.")

except Exception as e:
    print(f"[백엔드 로그][치명적 오류] TTS 클라이언트 초기화 중 예외 발생: {e}")
    traceback.print_exc()
    # tts_client는 계속 None으로 유지됩니다.

# --- Google Cloud TTS 클라이언트 초기화 끝 ---


# --- 데이터 저장소 및 관리 ---

# --- [수정] 하위 폴더 구조 검사 함수 (통합 구조 기준) ---
def check_and_update_folder_structure(folder_dict):
    """재귀적으로 사용자 폴더 구조 검사 및 필수 필드 추가 (통합 구조 기준)"""
    if not isinstance(folder_dict, dict): return
    for folder_name, folder_data in list(folder_dict.items()):
         if isinstance(folder_data, dict):
              folder_data.setdefault('name', folder_name)
              words = folder_data.setdefault('words', [])
              updated_words = []
              for i, word_entry in enumerate(words):
                  if isinstance(word_entry, dict) and 'word' in word_entry and 'meaning' in word_entry:
                       word_entry.setdefault('part_of_speech', None)
                       word_entry.setdefault('entries', [])
                       word_entry.setdefault('isStudied', False)
                       # ★★★ knowledgeState 필드 추가 ★★★
                       word_entry.setdefault('knowledgeState', 'unknown') # 기본값 'unknown' (모름)
                                                                        # 또는 'unclassified' (미분류)
                       word_entry.pop('movedFromPath', None)
                       word_entry.pop('movedFromIndex', None)
                       updated_words.append(word_entry)
                  else:
                       print(f"[경고] 폴더 '{folder_name}'의 단어 #{i} 형식이 잘못되었습니다. 건너<0xEB><0x9C><0x9C>니다: {word_entry}")
              folder_data['words'] = updated_words

              original_words = folder_data.setdefault('original_words', [w.copy() for w in folder_data['words']])
              updated_original_words = []
              for i, word_entry in enumerate(original_words):
                   if isinstance(word_entry, dict) and 'word' in word_entry and 'meaning' in word_entry:
                        word_entry.setdefault('part_of_speech', None)
                        word_entry.setdefault('entries', [])
                        word_entry.setdefault('isStudied', False)
                        # ★★★ knowledgeState 필드 추가 (original_words에도) ★★★
                        word_entry.setdefault('knowledgeState', 'unknown')
                        updated_original_words.append(word_entry)
              folder_data['original_words'] = updated_original_words

              folder_data.setdefault('is_shuffled', False)
              folder_data.setdefault('children', {})
              check_and_update_folder_structure(folder_data.get('children', {}))
         else:
              # ... (기존 폴더 오류 처리) ...
              # ★★★ 기본값에도 knowledgeState 추가 ★★★
              folder_dict[folder_name] = {
                  "name": folder_name, "words": [], "original_words": [],
                  "is_shuffled": False, "children": {}, "knowledgeState": "unknown" # 폴더 자체보다는 단어에 필요
              }
# --- 하위 폴더 구조 검사 함수 끝 ---

# --- [수정된] 데이터 저장 함수 (사용자 데이터만 저장) ---
def save_user_data():
    """사용자 데이터만 JSON 파일에 저장"""
    try:
        check_and_update_folder_structure(user_folders) # 저장 전 구조 검사
        with open(USER_DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(user_folders, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[백엔드 로그][오류] 사용자 데이터 저장 실패({USER_DATA_FILE}): {e}")
        traceback.print_exc()
# --- 데이터 저장 함수 끝 ---

# --- [수정된] 데이터 로드 함수 ---
def load_data():
    global default_folders, user_folders
    print(f"[DEBUG] 기본 데이터 파일 로드 시도: {DEFAULT_DATA_FILE}")
    try: # 기본 데이터 로드
        if os.path.exists(DEFAULT_DATA_FILE):
            with open(DEFAULT_DATA_FILE, "r", encoding="utf-8") as f:
                default_folders_loaded = json.load(f)
                if isinstance(default_folders_loaded, dict):
                     # ★★★ 로드된 기본 데이터 구조 검사 (읽기 전용이지만, 형식 보장) ★★★
                     temp_default_folders = copy.deepcopy(default_folders_loaded)
                     check_and_update_folder_structure(temp_default_folders) # 검사
                     default_folders = temp_default_folders # 검증된 데이터 사용
                     print(f"[백엔드 로그] 기본 데이터 로드 및 검증 완료: {DEFAULT_DATA_FILE}")
                else: print(f"[백엔드 로그][오류] 기본 데이터 파일 형식이 dict가 아님."); default_folders = {}
        else: default_folders = {}; print(f"[백엔드 로그][경고] 기본 데이터 파일 없음: {DEFAULT_DATA_FILE}")
    except Exception as e: print(f"[백엔드 로그][오류] 기본 데이터 로딩 오류: {e}"); default_folders = {}

    print(f"[DEBUG] 사용자 데이터 파일 로드 시도: {USER_DATA_FILE}")
    try: # 사용자 데이터 로드
        if os.path.exists(USER_DATA_FILE):
            with open(USER_DATA_FILE, "r", encoding="utf-8") as f:
                user_folders_loaded = json.load(f)
                if isinstance(user_folders_loaded, dict):
                    user_folders = user_folders_loaded
                    check_and_update_folder_structure(user_folders) # ★★★ 로드 후 구조 검사 및 보정 ★★★
                    print(f"[백엔드 로그] 사용자 데이터 로드 및 검증 완료: {USER_DATA_FILE}")
                else: print(f"[백엔드 로그][오류] 사용자 데이터 파일 형식이 dict가 아님."); user_folders = {}; save_user_data() # 빈 상태로 저장
        else: user_folders = {}; print(f"[백엔드 로그] 사용자 데이터 파일 없음. 새로 생성."); save_user_data() # 빈 상태로 저장

        # "복습 절실" 폴더 존재 보장 (사용자 데이터에만)
        if "복습 절실" not in user_folders:
            print("[백엔드 로그] '복습 절실' 폴더를 사용자 데이터에 생성합니다.")
            user_folders["복습 절실"] = {
                "name": "복습 절실", "words": [], "original_words": [],
                "is_shuffled": False, "children": {}
            }
            check_and_update_folder_structure(user_folders) # 생성 후에도 구조 확인
            save_user_data()

    except Exception as e: print(f"[백엔드 로그][오류] 사용자 데이터 로딩 오류({USER_DATA_FILE}): {e}"); user_folders = {}
# --- load_data 함수 끝 ---

load_data() # 앱 시작 시 데이터 로드

# --- ★★★ 폴더 트리 병합 함수 (isDefault 처리 추가) ★★★ ---
def merge_folder_trees(base_tree, override_tree):
    merged = {}
    # Base tree 복사 (isDefault 정보 포함)
    for key, base_value in base_tree.items():
        if isinstance(base_value, dict):
            merged[key] = copy.deepcopy(base_value)
            merged[key]['isDefault'] = base_value.get('isDefault', False) # 명시적으로 isDefault 복사
        else:
            merged[key] = copy.deepcopy(base_value) # 혹시 모를 비정상 데이터

    # Override tree 병합 (사용자 데이터 우선)
    for key, override_value in override_tree.items():
        if key in merged:
            base_value = merged[key]
            if isinstance(base_value, dict) and isinstance(override_value, dict):
                # 하위 폴더 재귀 병합
                merged_children = merge_folder_trees(
                    base_value.get("children", {}),
                    override_value.get("children", {})
                )
                # 사용자 데이터 기준으로 병합된 항목 생성
                merged_item = copy.deepcopy(override_value)
                merged_item['isDefault'] = False # 사용자 데이터는 isDefault=False
                merged_item['children'] = merged_children
                merged[key] = merged_item
            else: # 형식이 다르거나 dict가 아니면 사용자 데이터로 덮어쓰기
                merged[key] = copy.deepcopy(override_value)
                if isinstance(merged[key], dict):
                    merged[key]['isDefault'] = False # 사용자 데이터 플래그
        else: # Base에는 없고 사용자 데이터에만 있는 경우
            merged[key] = copy.deepcopy(override_value)
            if isinstance(merged[key], dict):
                 merged[key]['isDefault'] = False # 사용자 데이터 플래그
    return merged

# --- ★★★ 폴더 리스트 변환 함수 (isDefault 포함) ★★★ ---
def get_folder_list_recursive(folder_dict):
    folder_list = []
    for name, data in folder_dict.items():
        if isinstance(data, dict):
            folder_info = {
                "name": name,
                "isDefault": data.get("isDefault", False) # isDefault 정보 포함
            }
            children = data.get("children")
            if isinstance(children, dict) and children:
                folder_info["children"] = get_folder_list_recursive(children)
            folder_list.append(folder_info)
        else: print(f"[경고] get_folder_list_recursive: 잘못된 폴더 데이터 형식 - key: {name}")
    return folder_list

# --- [신규] 경로가 기본 폴더인지 확인 ---
# (기존 코드 유지 - 로직 변경 없음)
def is_path_default(path_str):
    if not path_str: return False
    path_list = path_str.split('/')
    try: # 사용자 데이터에 경로가 있는지 확인
        temp_user = user_folders; [temp_user := temp_user[name] for name in path_list]; return False
    except KeyError: # 사용자 데이터에 없음 -> 기본 데이터 확인
        try:
            temp_default = default_folders
            for name in path_list:
                folder_data = temp_default[name];
                # ★★★ isDefault 플래그 확인 강화 ★★★
                if not isinstance(folder_data, dict) or not folder_data.get("isDefault", False):
                     # 기본 데이터지만 isDefault가 false거나 dict가 아니면 기본 경로 아님
                     return False
                temp_default = folder_data.get("children", {})
            return True # 경로 끝까지 isDefault=true 였음
        except KeyError: return False
        except Exception: return False
    except Exception: return False

# --- [신규] 사용자 데이터에서만 폴더 데이터 참조 얻기 ---
# (기존 코드 유지 - 로직 변경 없음)
def get_user_folder_data_by_path(path_str):
    if not path_str: return None
    path_list = path_str.split('/')
    current_level_ref = user_folders # <<< user_folders 에서 시작
    folder_data_ref = None
    try:
        for i, name in enumerate(path_list):
            if isinstance(current_level_ref, dict) and name in current_level_ref:
                folder_data_ref = current_level_ref[name] # <<< 현재 폴더 데이터 참조
                if i == len(path_list) - 1:
                    return folder_data_ref # <<< 찾았으면 바로 반환
                current_level_ref = folder_data_ref.get("children", {}) # <<< 다음 단계로
            else:
                return None # 경로 중간에 없음
        return None
    except Exception as e:
         print(f"[오류] 사용자 폴더 참조 얻기: {e}")
         return None

# --- [신규] 기본 데이터에서만 폴더 데이터 참조 얻기 (읽기용) ---
# (기존 코드 유지 - 로직 변경 없음)
def get_default_folder_data_by_path(path_str):
     if not path_str: return None
     path_list = path_str.split('/')
     current_level = default_folders
     folder_data = None
     try:
         for i, name in enumerate(path_list):
             if isinstance(current_level, dict) and name in current_level:
                  folder_data = current_level[name]
                  if i == len(path_list) - 1:
                       return folder_data
                  current_level = folder_data.get("children", {})
             else: return None
         return None
     except Exception as e:
         print(f"[오류] 기본 폴더 참조 얻기: {e}")
         return None

# --- [신규] Copy-on-Write 함수 (통합 구조 복사) ---
def ensure_user_copy_exists(path_str):
    if not path_str: return None
    path_list = path_str.split('/')
    user_parent_ref = user_folders
    default_parent = default_folders
    created_new_copy = False

    try:
        for i, name in enumerate(path_list):
            current_sub_path = '/'.join(path_list[:i+1])

            # ★★★ "복습 절실" 특별 처리 (사용자 데이터에만 존재 보장) ★★★
            if current_sub_path == "복습 절실":
                if "복습 절실" not in user_folders:
                    print("[Copy-on-Write] '복습 절실' 폴더를 사용자 데이터에 생성합니다.")
                    user_folders["복습 절실"] = { # 기본 구조 생성 (통합)
                        "name": "복습 절실", "words": [], "original_words": [],
                        "is_shuffled": False, "children": {}, "isDefault": False # 명시적 플래그
                    }
                    check_and_update_folder_structure(user_folders) # 구조 검사
                    created_new_copy = True # 저장 필요
                # 다음 레벨로 이동 (복습 절실은 최상위)
                if i == len(path_list) - 1: break # 마지막이면 루프 종료
                user_parent_ref = user_folders["복습 절실"].setdefault("children", {})
                default_parent = {} # 기본 데이터에는 해당 경로 없음
                continue # 다음 경로 요소 처리

            # 기본 폴더 데이터 가져오기 (isDefault 포함)
            base_folder_data = default_parent.get(name) if isinstance(default_parent, dict) else None
            is_base_path_valid_default = isinstance(base_folder_data, dict) and base_folder_data.get("isDefault", False)

            # 사용자 폴더에 해당 이름이 있는지 확인
            user_folder_exists = name in user_parent_ref and isinstance(user_parent_ref.get(name), dict)

            if user_folder_exists:
                # 사용자 폴더가 이미 존재하면 다음 레벨로 이동
                user_parent_ref = user_parent_ref[name].setdefault("children", {})
                # 기본 경로도 유효하면 같이 이동, 아니면 기본 경로는 끝
                default_parent = base_folder_data.get("children", {}) if is_base_path_valid_default else {}
            elif is_base_path_valid_default:
                # 사용자 폴더는 없지만, 유효한 기본 폴더가 있으면 복사
                print(f"[Copy-on-Write] 기본 폴더 '{name}' -> 사용자 데이터 복사 (경로: {current_sub_path})")
                # ★★★ 통합 구조 전체 복사 ★★★
                user_copy = {
                    "name": base_folder_data.get("name", name),
                    "words": copy.deepcopy(base_folder_data.get("words", [])),
                    "original_words": copy.deepcopy(base_folder_data.get("original_words", [])),
                    "is_shuffled": base_folder_data.get("is_shuffled", False),
                    "children": {}, # 하위는 빈 상태로 시작 (하위까지 복사 안 함)
                    "isDefault": False # 사용자 복사본 플래그
                }
                check_and_update_folder_structure({name: user_copy}) # 복사본 구조 검사
                user_parent_ref[name] = user_copy
                created_new_copy = True
                # 다음 레벨로 이동
                user_parent_ref = user_parent_ref[name].setdefault("children", {})
                default_parent = base_folder_data.get("children", {})
            else:
                # 사용자 폴더도 없고, 유효한 기본 폴더도 없으면 경로 없음
                print(f"[오류] 경로 없음: '{current_sub_path}'")
                return None # 경로 없음

        if created_new_copy: save_user_data()
        # 최종 사용자 폴더 참조 반환
        return get_user_folder_data_by_path(path_str)
    except Exception as e: print(f"[오류] ensure_user_copy_exists: {e}"); traceback.print_exc(); return None


# --- 기본 라우트 ---
@app.route('/')
def index(): return render_template('index.html')

# --- 폴더 API (isDefault 처리 반영) ---
@app.route('/api/folders', methods=['GET'])
def get_folders_api():
    try:
        merged = merge_folder_trees(copy.deepcopy(default_folders), user_folders)
        tree = get_folder_list_recursive(merged) # 재귀적으로 리스트 생성

        # ★★★ 정렬 없이 생성된 트리 리스트를 바로 반환 ★★★
        # "복습 절실"을 맨 위로 보내는 로직은 유지하는 것이 좋을 수 있습니다.
        review_item = None
        other_items = []
        for item in tree:
            if isinstance(item, dict) and item.get('name') == '복습 절실':
                review_item = item
            else:
                other_items.append(item)

        final_list_unsorrted = []
        if review_item:
            final_list_unsorrted.append(review_item)
        final_list_unsorrted.extend(other_items) # 나머지 항목은 get_folder_list_recursive 순서 유지

        return jsonify({'success': True, 'folders': final_list_unsorrted}) # <<< 정렬 안된 리스트 반환


    except Exception as e: print(f"[오류] /api/folders: {e}"); traceback.print_exc(); return jsonify({'success': False, 'error': '폴더 목록 생성 오류'}), 500

# (create_root_folder_api, create_subfolder_api, rename_folder_api, delete_folder_api - 기존 코드 유지, 통합 구조 자동 적용됨)
@app.route('/api/folder', methods=['POST'])
def create_root_folder_api():
    data = request.get_json(); folder_name = data.get('folder_name')
    if not folder_name: return jsonify({'success': False, 'error': '폴더 이름 필요'}), 400
    if '/' in folder_name: return jsonify({'success': False, 'error': '폴더 이름에 / 사용 불가'}), 400
    if folder_name in user_folders or folder_name in default_folders: return jsonify({'success': False, 'error': '이미 존재하는 폴더 이름'}), 409
    # ★★★ 통합 구조로 생성 ★★★
    user_folders[folder_name] = {"name": folder_name, "words": [], "original_words": [], "is_shuffled": False, "children": {}, "isDefault": False}
    save_user_data()
    print(f"[백엔드 로그] 사용자 최상위 폴더 '{folder_name}' 생성 완료")
    merged = merge_folder_trees(copy.deepcopy(default_folders), user_folders)
    return jsonify({'success': True, 'folders': get_folder_list_recursive(merged)}), 201

@app.route('/api/folder/sub', methods=['POST'])
def create_subfolder_api():
    data = request.get_json(); parent_path_str = data.get('parent_path'); subfolder_name = data.get('subfolder_name')
    if not parent_path_str or not subfolder_name: return jsonify({'success': False, 'error': '정보 누락'}), 400
    if '/' in subfolder_name: return jsonify({'success': False, 'error': '폴더 이름에 / 사용 불가'}), 400
    parent_folder_data = ensure_user_copy_exists(parent_path_str) # Copy-on-Write
    if parent_folder_data is None: return jsonify({'success': False, 'error': f"상위 폴더 '{parent_path_str}' 접근/생성 실패"}), 404
    parent_children = parent_folder_data.setdefault("children", {})
    if not isinstance(parent_children, dict): parent_children = parent_folder_data["children"] = {}
    # 중복 체크 (기본+사용자)
    default_parent_children = {}
    default_parent = get_default_folder_data_by_path(parent_path_str)
    if default_parent and isinstance(default_parent.get('children'), dict):
        default_parent_children = default_parent['children']
    if subfolder_name in parent_children or subfolder_name in default_parent_children: return jsonify({'success': False, 'error': f"하위 폴더 '{subfolder_name}' 이미 존재"}), 409
    # ★★★ 통합 구조로 생성 ★★★
    parent_children[subfolder_name] = {"name": subfolder_name, "words": [], "original_words": [], "is_shuffled": False, "children": {}, "isDefault": False}
    save_user_data()
    print(f"[백엔드 로그] 폴더 '{parent_path_str}' 아래 사용자 하위 폴더 '{subfolder_name}' 생성 완료")
    merged = merge_folder_trees(copy.deepcopy(default_folders), user_folders)
    return jsonify({'success': True, 'folders': get_folder_list_recursive(merged)}), 201

@app.route('/api/folder/rename', methods=['PUT'])
def rename_folder_api():
    data = request.get_json(); folder_path_str = data.get('folder_path'); new_name = data.get('new_name')
    if not folder_path_str or not new_name: return jsonify({'success': False, 'error': '정보 누락'}), 400
    if '/' in new_name: return jsonify({'success': False, 'error': '폴더 이름에 / 사용 불가'}), 400
    # ★★★ 이름 변경은 사용자 폴더에만 가능 -> CoW 필요 ★★★
    target_folder_data = ensure_user_copy_exists(folder_path_str) # Copy-on-Write
    if target_folder_data is None: return jsonify({'success': False, 'error': f"폴더 '{folder_path_str}' 접근/생성 실패 (이름 변경 대상)"}), 404
    folder_path_list = folder_path_str.split('/'); target_name = folder_path_list[-1]; parent_path_list = folder_path_list[:-1]
    parent_dict_ref = user_folders # 사용자 데이터에서 부모 찾기
    if parent_path_list:
        temp_ref = user_folders;
        try:
            for name in parent_path_list:
                # get_user_folder_data_by_path와 유사하게 부모 참조 찾아가기
                if isinstance(temp_ref, dict) and name in temp_ref:
                     parent_data = temp_ref[name]
                     if isinstance(parent_data, dict):
                         temp_ref = parent_data.get("children")
                     else: raise KeyError # 잘못된 구조
                else: raise KeyError # 경로 없음
            parent_dict_ref = temp_ref # children 딕셔너리 참조
        except KeyError: return jsonify({'success': False, 'error': '부모 경로 오류 (사용자)'}), 404
    # parent_dict_ref가 dict인지 최종 확인
    if not isinstance(parent_dict_ref, dict): return jsonify({'success': False, 'error': '부모 경로 참조 오류 (children 아님)'}), 500
    if target_name not in parent_dict_ref: return jsonify({'success': False, 'error': f"폴더 '{target_name}' 없음 (사용자 부모 내)"}), 404
    if new_name == target_name: merged = merge_folder_trees(copy.deepcopy(default_folders), user_folders); return jsonify({'success': True, 'folders': get_folder_list_recursive(merged)})
    # 중복 체크 (기본+사용자)
    default_parent_children = {}
    default_parent = get_default_folder_data_by_path('/'.join(parent_path_list))
    if default_parent and isinstance(default_parent.get('children'), dict):
        default_parent_children = default_parent['children']
    if new_name in parent_dict_ref or new_name in default_parent_children: return jsonify({'success': False, 'error': f"이름 '{new_name}' 이미 사용 중"}), 409
    folder_data_to_rename = parent_dict_ref.pop(target_name)
    folder_data_to_rename['name'] = new_name # 내부 name 필드도 업데이트
    parent_dict_ref[new_name] = folder_data_to_rename
    save_user_data()
    print(f"[백엔드 로그] 사용자 폴더 '{folder_path_str}' -> '{new_name}' 이름 변경 완료")
    merged = merge_folder_trees(copy.deepcopy(default_folders), user_folders)
    return jsonify({'success': True, 'folders': get_folder_list_recursive(merged)})


@app.route('/api/folder', methods=['DELETE'])
def delete_folder_api():
    data = request.get_json(); folder_path_str = data.get('folder_path')
    if not folder_path_str: return jsonify({'success': False, 'error': '폴더 경로 필요'}), 400
    # ★★★ is_path_default 함수로 기본 폴더 삭제 방지 ★★★
    if is_path_default(folder_path_str): return jsonify({'success': False, 'error': '기본 폴더는 삭제할 수 없습니다.'}), 403
    folder_path_list = folder_path_str.split('/'); target_name = folder_path_list[-1]; parent_path_list = folder_path_list[:-1]
    if target_name == "복습 절실": return jsonify({'success': False, 'error': "'복습 절실' 폴더는 삭제할 수 없습니다."}), 400

    parent_dict_ref = user_folders # 사용자 데이터에서만 찾음
    if parent_path_list:
        temp_ref = user_folders;
        try:
             for name in parent_path_list:
                 if isinstance(temp_ref, dict) and name in temp_ref:
                      parent_data = temp_ref[name]
                      if isinstance(parent_data, dict): temp_ref = parent_data.get("children")
                      else: raise KeyError
                 else: raise KeyError
             parent_dict_ref = temp_ref
        except KeyError: return jsonify({'success': False, 'error': '부모 경로 오류 (사용자)'}), 404

    if not isinstance(parent_dict_ref, dict): return jsonify({'success': False, 'error': '부모 경로 참조 오류 (children 아님)'}), 500

    if target_name in parent_dict_ref:
        del parent_dict_ref[target_name]; save_user_data()
        print(f"[백엔드 로그] 사용자 폴더 '{folder_path_str}' 삭제 완료")
        merged = merge_folder_trees(copy.deepcopy(default_folders), user_folders)
        return jsonify({'success': True, 'folders': get_folder_list_recursive(merged)})
    else: return jsonify({'success': False, 'error': f"폴더 '{target_name}' 없음 (사용자 데이터 내)"}), 404

@app.route('/api/folders/sort', methods=['POST']) # 폴더 정렬 (복습 절실 상단 고정)
def sort_folders_api():
    global user_folders
    data = request.get_json(); sort_type = data.get('sort_type', 'name_asc')
    reverse_sort = (sort_type == 'name_desc')

    # --- 정렬 헬퍼 함수 ---
    def sort_folder_dict(folder_dict, reverse=False):
        return dict(sorted(folder_dict.items(), key=lambda item: item[0].lower(), reverse=reverse))
    def sort_recursive(current_level, reverse):
        if not isinstance(current_level, dict): return current_level
        # "복습 절실"은 정렬에서 제외하고 재귀 호출
        sorted_level = {}
        items_to_sort = {}
        if "복습 절실" in current_level:
             sorted_level["복습 절실"] = current_level["복습 절실"] # 그대로 유지
        for name, data in current_level.items():
             if name != "복습 절실": items_to_sort[name] = data

        sorted_items = sort_folder_dict(items_to_sort, reverse)
        for name, data in sorted_items.items():
            if isinstance(data, dict) and "children" in data and isinstance(data["children"], dict) and data["children"]:
                data["children"] = sort_recursive(data["children"], reverse) # 하위도 정렬 (복습 제외 로직 포함)
            sorted_level[name] = data # 정렬된 항목 추가
        return sorted_level
    # --- 정렬 헬퍼 함수 끝 ---

    try:
        # 사용자 폴더 내부 구조 정렬 ("복습 절실" 제외)
        user_folders_sorted = sort_recursive(user_folders, reverse_sort)
        user_folders = user_folders_sorted
        save_user_data()
        print(f"[백엔드 로그] 사용자 폴더 정렬 완료 (타입: {sort_type})")

        # 병합 및 최종 리스트 생성 (정렬 로직은 get_folders_api와 동일하게 적용)
        merged = merge_folder_trees(copy.deepcopy(default_folders), user_folders)
        final_tree_list = get_folder_list_recursive(merged)

        review_folder_item = None; other_folder_items = []
        for item in final_tree_list:
            if isinstance(item, dict) and item.get('name') == '복습 절실': review_folder_item = item
            elif isinstance(item, dict) and 'name' in item: other_folder_items.append(item)
            else: print(f"[경고] 최종 트리 리스트에 잘못된 항목 발견: {item}")

        other_folder_items.sort(key=lambda x: x['name'].lower(), reverse=reverse_sort)

        final_sorted_list = []
        if review_folder_item: final_sorted_list.append(review_folder_item)
        final_sorted_list.extend(other_folder_items)

        return jsonify({'success': True, 'folders': final_sorted_list})
    except Exception as e:
        print(f"[오류] 폴더 정렬: {e}"); traceback.print_exc()
        merged = merge_folder_trees(copy.deepcopy(default_folders), user_folders)
        return jsonify({'success': False, 'error': f'폴더 정렬 오류: {e}', 'folders': get_folder_list_recursive(merged)}), 500


# --- 단어 관련 API (통합 구조 적용) ---

@app.route('/api/words', methods=['GET'])
def get_words_api():
    folder_path = request.args.get('path')
    print(f"[DEBUG] GET /api/words 요청 받음, 경로: {folder_path}")
    folder_data = None; source = "unknown"
    # 1. 사용자 데이터 우선 검색
    folder_data = get_user_folder_data_by_path(folder_path)
    if folder_data: source = "user"
    else: # 2. 사용자 데이터 없으면 기본 데이터 검색
        folder_data = get_default_folder_data_by_path(folder_path)
        if folder_data: source = "default"

    if folder_data is None: return jsonify({'success': False, 'error': '폴더 경로 없음'}), 404
    # ★★★ words 필드가 리스트인지 확인하고 반환 ★★★
    words_list = folder_data.get("words", [])
    if not isinstance(words_list, list):
         print(f"[백엔드 로그][경고] 폴더 '{folder_path}' ({source})의 words 데이터 형식 오류. 빈 리스트 반환.")
         words_list = []
    print(f"[DEBUG] 폴더 '{folder_path}'에서 {len(words_list)}개 단어 반환 (소스: {source})")
    return jsonify({'success': True, 'words': words_list})

@app.route('/api/words', methods=['POST']) # 단어 추가 (파일 또는 단일)
def add_words_api():
    # 파일 업로드 처리
    if 'file' in request.files:
        folder_path = request.form.get('path'); file = request.files['file']
        folder_data = ensure_user_copy_exists(folder_path) # CoW
        if folder_data is None: return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404
        try:
            new_words = []
            filename = file.filename.lower()
            content_type = file.content_type

            file_content = file.read().decode('utf-8-sig') # BOM 제거
            lines = file_content.splitlines()
            start_line = 0

            # 간단한 CSV/TSV 감지
            delimiter = ',' # 기본값 CSV
            if lines and len(lines[0].split('\t')) >= 2:
                delimiter = '\t' # 탭 구분자 감지
                print("[DEBUG] TSV 파일 감지됨")

            if lines and len(lines[0].split(delimiter)) >= 2: # 헤더 감지
                 if any(h in lines[0].lower() for h in ['word', 'meaning', '단어', '뜻']):
                      start_line = 1; print("[DEBUG] 헤더 행 감지됨")

            # CSV 리더 사용 개선
            csv_reader = csv.reader(lines[start_line:], delimiter=delimiter)

            for row in csv_reader:
                if len(row) >= 2:
                    word = row[0].strip()
                    meaning = row[1].strip()
                    if word and meaning: # 빈 단어/뜻 제외
                        # ★★★ 통합 구조로 생성 ★★★
                        new_words.append({
                            "word": word,
                            "meaning": meaning,
                            "part_of_speech": None, # 파일에서는 품사 정보 없음
                            "entries": [],          # 파일에서는 상세 정보 없음
                            "isStudied": False      # 파일로 추가시 학습 안됨
                        })
                elif len(row) == 1 and row[0].strip(): # 한 컬럼만 있는 경우 (단어만)
                     word = row[0].strip()
                     new_words.append({ "word": word, "meaning": "", "part_of_speech": None, "entries": [], "isStudied": False })


            folder_data['words'] = new_words # 파일 내용은 덮어쓰기
            folder_data['original_words'] = [w.copy() for w in new_words]
            folder_data['is_shuffled'] = False
            save_user_data()
            print(f"[백엔드 로그] 사용자 폴더 '{folder_path}' 파일 단어 {len(new_words)}개 로드 (덮어쓰기)")
            return jsonify({'success': True, 'words': new_words})
        except Exception as e: print(f"[오류] 파일 처리: {e}"); traceback.print_exc(); return jsonify({'success': False, 'error': f'파일 처리 오류: {e}'}), 500
    # 단일 단어 추가 처리
    else:
        data = request.get_json(); folder_path = data.get('path')
        # ★★★ 통합 구조 필드 받기 ★★★
        word = data.get('word'); meaning = data.get('meaning'); part_of_speech = data.get('part_of_speech')
        # entries는 이 API로 추가하지 않음 (기본값 [])

        if not folder_path or not word or meaning is None: # meaning은 빈 문자열일 수 있음
             return jsonify({'success': False, 'error': '정보 누락 (path, word, meaning 필수)'}), 400

        folder_data = ensure_user_copy_exists(folder_path) # CoW
        if folder_data is None: return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404

        words = folder_data.setdefault('words', []); originals = folder_data.setdefault('original_words', [])
        if not isinstance(words, list): words = folder_data['words'] = []
        if not isinstance(originals, list): originals = folder_data['original_words'] = [w.copy() for w in words]

        # ★★★ 통합 구조로 entry 생성 ★★★
        entry = {
            "word": word.strip(),
            "meaning": meaning.strip(),
            "part_of_speech": (part_of_speech or "").strip() or None, # 빈 문자열이면 None
            "entries": [], # 기본값 빈 리스트
            "isStudied": False # 새로 추가시 학습 안됨
        }
        words.append(entry); originals.append(entry.copy())
        save_user_data()
        return jsonify({'success': True, 'words': words})

@app.route('/api/words/<int:word_index>', methods=['PUT']) # 단어 수정
def edit_word_api(word_index):
    data = request.get_json(); folder_path = data.get('path')
    # ★★★ 통합 구조 필드 받기 ★★★
    new_word = data.get('word'); new_meaning = data.get('meaning'); new_pos = data.get('part_of_speech')
    # entries는 이 API로 수정하지 않음

    if folder_path is None or new_word is None or new_meaning is None:
        return jsonify({'success': False, 'error': '정보 누락 (path, word, meaning 필수)'}), 400

    folder_data = ensure_user_copy_exists(folder_path) # CoW
    if folder_data is None: return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404

    words = folder_data.setdefault('words', []); originals = folder_data.setdefault('original_words', [])
    if not isinstance(words, list): words = folder_data['words'] = []
    if not isinstance(originals, list): originals = folder_data['original_words'] = [w.copy() for w in words]

    if not (0 <= word_index < len(words)): return jsonify({'success': False, 'error': '단어 인덱스 오류'}), 400

    old_entry_in_words = words[word_index] # 수정 전 데이터 (words 리스트 기준)
    if not isinstance(old_entry_in_words, dict): return jsonify({'success': False, 'error': '수정 대상 데이터 오류 (words)'}), 500

    # ★★★ words 리스트 업데이트 ★★★
    entry_to_update_in_words = words[word_index]
    entry_to_update_in_words['word'] = new_word.strip()
    entry_to_update_in_words['meaning'] = new_meaning.strip()
    entry_to_update_in_words['part_of_speech'] = (new_pos or "").strip() or None
    # isStudied 등 다른 플래그는 유지

    # ★★★ original_words 리스트 업데이트 (값 기반 검색 후 업데이트) ★★★
    # 원본 리스트에서 어떤 항목을 수정할지 결정하는 것이 중요.
    # 만약 words 리스트가 셔플/정렬되지 않은 상태이고, original_words와 동일한 순서 및 내용을 가지고 있다면
    # word_index를 그대로 사용할 수 있다.
    # 하지만, 셔플/정렬된 상태라면, old_entry_in_words의 값(주로 word와 meaning)을 기준으로 original_words에서 찾아야 한다.
    
    # 여기서는 original_words가 항상 words의 초기 상태를 깊은 복사한 것이라고 가정하고,
    # 수정 전 old_entry_in_words의 값으로 original_words에서 해당 항목을 찾는다.
    # (만약 is_shuffled == False 이고, 정렬된 적 없다면 word_index를 그대로 써도 되지만, 안전하게 값으로 찾기)
    orig_idx_to_update = -1
    for i, ow_entry in enumerate(originals):
        if isinstance(ow_entry, dict) and \
           ow_entry.get('word') == old_entry_in_words.get('word') and \
           ow_entry.get('meaning') == old_entry_in_words.get('meaning') and \
           ow_entry.get('part_of_speech') == old_entry_in_words.get('part_of_speech'): # 좀 더 정확한 매칭
            # 만약 isStudied 등의 플래그가 old_entry_in_words에만 있고 originals에는 없을 수 있으므로,
            # 주요 내용 필드(word, meaning, pos)로 식별
            orig_idx_to_update = i
            break
    
    if orig_idx_to_update != -1:
        originals[orig_idx_to_update]['word'] = new_word.strip()
        originals[orig_idx_to_update]['meaning'] = new_meaning.strip()
        originals[orig_idx_to_update]['part_of_speech'] = (new_pos or "").strip() or None
        # original_words의 isStudied 등 다른 플래그는 words와 동기화하지 않음 (원본은 원본 상태 유지)
    else:
        # 만약 words가 셔플/정렬되어 original_words와 순서가 다르고,
        # old_entry_in_words와 정확히 일치하는 항목을 original_words에서 못 찾았다면,
        # 이는 데이터 불일치 가능성을 의미. 또는 편집 전 내용이 original_words에 없는 경우.
        # 이 경우, original_words를 업데이트하지 않거나, 더 복잡한 동기화 로직 필요.
        # 현재로서는, 못 찾으면 경고만 출력.
        print(f"[경고] 수정 단어의 원본을 original_words에서 찾지 못함: {old_entry_in_words}")


    save_user_data()
    return jsonify({'success': True, 'words': words})


# app.py 에 새 API 엔드포인트 추가

@app.route('/api/words/<int:word_index>/knowledge_state', methods=['PUT'])
def update_word_knowledge_state_api(word_index):
    try: # 전체 함수 내용을 try-except로 감싸서 구체적인 오류를 로깅하고 반환
        data = request.get_json()
        folder_path = data.get('path')
        new_knowledge_state = data.get('knowledgeState')

        if folder_path is None or new_knowledge_state is None:
            return jsonify({'success': False, 'error': '폴더 경로 또는 새로운 상태 정보 누락'}), 400

        valid_states = ['known', 'unsure', 'unknown', 'unclassified']
        if new_knowledge_state not in valid_states:
            return jsonify({'success': False, 'error': f'유효하지 않은 상태 값: {new_knowledge_state}'}), 400

        folder_data_ref = ensure_user_copy_exists(folder_path)
        if folder_data_ref is None:
            print(f"[오류] update_word_knowledge_state_api: 폴더 접근/생성 실패 - 경로: {folder_path}")
            return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404

        # folder_data_ref는 폴더 객체 자체이므로, 'words' 키에 접근합니다.
        if 'words' not in folder_data_ref or not isinstance(folder_data_ref['words'], list):
            folder_data_ref['words'] = [] # words 키가 없거나 리스트가 아니면 초기화
        
        words_list = folder_data_ref['words']

        if not (0 <= word_index < len(words_list)):
            print(f"[오류] update_word_knowledge_state_api: 단어 인덱스 오류 - 인덱스: {word_index}, 리스트 길이: {len(words_list)}")
            return jsonify({'success': False, 'error': '단어 인덱스 오류'}), 400

        word_entry_to_update = words_list[word_index]
        if not isinstance(word_entry_to_update, dict):
            print(f"[오류] update_word_knowledge_state_api: 수정 대상 단어 데이터 오류 - 데이터: {word_entry_to_update}")
            return jsonify({'success': False, 'error': '수정 대상 단어 데이터 오류'}), 500

        old_state = word_entry_to_update.get('knowledgeState')
        word_entry_to_update['knowledgeState'] = new_knowledge_state
        
        save_user_data()
        print(f"[백엔드 로그] 단어 '{word_entry_to_update.get('word')}' 상태 변경: '{old_state}' -> '{new_knowledge_state}' (경로: {folder_path}, 인덱스: {word_index})")
        
        return jsonify({'success': True, 'message': '단어 상태 업데이트 성공', 'updatedWord': word_entry_to_update})

    except Exception as e:
        print(f"[백엔드 치명적 오류] /api/words/<int:word_index>/knowledge_state: {e}")
        traceback.print_exc() # 콘솔에 전체 트레이스백 출력
        return jsonify({'success': False, 'error': f'서버 내부 오류: {str(e)}'}), 500


@app.route('/api/words/bulk_update_state', methods=['POST']) # 또는 PUT도 허용하려면 ['POST', 'PUT']
def bulk_update_knowledge_state_api():
    try:
        data = request.get_json()
        folder_path = data.get('path')
        filter_state = data.get('filterState') # 어떤 상태의 단어들을 변경할 것인지
        new_state = data.get('newState')       # 어떤 새로운 상태로 변경할 것인지

        if not folder_path or not filter_state or not new_state:
            return jsonify({'success': False, 'error': '필수 정보 누락 (path, filterState, newState)'}), 400

        valid_states = ['known', 'unsure', 'unknown', 'unclassified']
        # filter_state도 'all'이 아닌 유효한 상태여야 함
        if filter_state not in valid_states or new_state not in valid_states:
            return jsonify({'success': False, 'error': '유효하지 않은 상태 값'}), 400
        
        if filter_state == 'all':
             return jsonify({'success': False, 'error': "'all' 필터는 이 API로 상태를 일괄 변경할 수 없습니다."}), 400


        folder_data_ref = ensure_user_copy_exists(folder_path)
        if folder_data_ref is None:
            print(f"[오류] bulk_update_knowledge_state_api: 폴더 접근/생성 실패 - 경로: {folder_path}")
            return jsonify({'success': False, 'error': f"폴더 '{folder_path}' 접근/생성 실패"}), 404

        # words 키에 대한 안전한 접근
        if 'words' not in folder_data_ref or not isinstance(folder_data_ref['words'], list):
            folder_data_ref['words'] = [] 
        
        words_list = folder_data_ref['words']

        updated_count = 0
        for word_entry in words_list:
            if isinstance(word_entry, dict):
                current_word_state = word_entry.get('knowledgeState') # None일 수 있음
                # None인 경우를 'unclassified'로 처리할지, 아니면 정확히 filter_state와 일치할 때만 변경할지 결정
                # 여기서는 None이면 filter_state와 비교 시 false가 되도록 함 (명시적 상태만 변경)
                # 또는, current_word_state = word_entry.get('knowledgeState') or 'unclassified' 와 같이 처리 가능

                if current_word_state == filter_state: # 정확히 일치하는 상태만 변경
                    word_entry['knowledgeState'] = new_state
                    updated_count += 1
        
        if updated_count > 0:
            save_user_data()
            print(f"[백엔드 로그] 폴더 '{folder_path}'의 '{filter_state}' 상태 단어 {updated_count}개를 '{new_state}'로 변경 완료.")
        
        # 프론트엔드에서 currentWords를 직접 업데이트하므로, 업데이트된 words_list를 다시 보내주는 것이 좋음
        return jsonify({'success': True, 'message': f'{updated_count}개 단어 상태 변경 완료.', 'words': words_list})

    except Exception as e:
        print(f"[백엔드 치명적 오류] /api/words/bulk_update_state: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'서버 내부 오류: {str(e)}'}), 500


# (delete_word_api, delete_all_words_api - 기존 로직 유지, 통합 구조 자동 적용됨)
@app.route('/api/words/<int:word_index>', methods=['DELETE']) # 단어 삭제
def delete_word_api(word_index):
    data = request.get_json(); folder_path = data.get('path')
    if folder_path is None: return jsonify({'success': False, 'error': '경로 필요'}), 400
    folder_data = ensure_user_copy_exists(folder_path) # CoW
    if folder_data is None: return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404
    words = folder_data.setdefault('words', []); originals = folder_data.setdefault('original_words', [])
    if not isinstance(words, list): words = folder_data['words'] = []
    if not isinstance(originals, list): originals = folder_data['original_words'] = [w.copy() for w in words] # 방어
    if not (0 <= word_index < len(words)): return jsonify({'success': False, 'error': '단어 인덱스 오류'}), 400
    
    deleted_word_from_words = words.pop(word_index) # words 리스트에서 삭제

    # original_words 리스트에서도 해당 항목 삭제
    # 삭제 시에도, words 리스트가 셔플/정렬된 상태일 수 있으므로 값 기반으로 original_words에서 찾아 삭제
    orig_idx_to_delete = -1
    if isinstance(deleted_word_from_words, dict):
        for i, ow_entry in enumerate(originals):
            if isinstance(ow_entry, dict) and \
               ow_entry.get('word') == deleted_word_from_words.get('word') and \
               ow_entry.get('meaning') == deleted_word_from_words.get('meaning') and \
               ow_entry.get('part_of_speech') == deleted_word_from_words.get('part_of_speech'):
                orig_idx_to_delete = i
                break
    
    if orig_idx_to_delete != -1:
        del originals[orig_idx_to_delete]
    else:
        print(f"[경고] 삭제 단어의 원본을 original_words에서 찾지 못함: {deleted_word_from_words}")

    save_user_data()
    return jsonify({'success': True, 'words': words})

@app.route('/api/words', methods=['DELETE']) # 모든 단어 삭제
def delete_all_words_api():
    data = request.get_json(); folder_path = data.get('path')
    if folder_path is None: return jsonify({'success': False, 'error': '경로 필요'}), 400
    folder_data = ensure_user_copy_exists(folder_path) # CoW
    if folder_data is None: return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404
    folder_data['words'] = []; folder_data['original_words'] = []; folder_data['is_shuffled'] = False
    save_user_data()
    print(f"[백엔드 로그] 사용자 폴더 '{folder_path}' 모든 단어 삭제 완료")
    return jsonify({'success': True, 'words': []})


# [수정됨] 단어/뜻 교환: 통합 구조의 word, meaning 필드만 교환
@app.route('/api/words/swap', methods=['POST'])
def swap_api():
    data = request.get_json(); folder_path = data.get('path')
    folder_data = ensure_user_copy_exists(folder_path) # CoW
    if folder_data is None: return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404
    words = folder_data.setdefault('words', []); originals = folder_data.setdefault('original_words', [])
    if isinstance(words, list):
        for entry in words:
            if isinstance(entry, dict):
                # ★★★ word와 meaning 값 교환 ★★★
                w = entry.get('word','')
                m = entry.get('meaning','')
                entry['word'] = m
                entry['meaning'] = w
                # pos, entries, isStudied 등은 변경하지 않음
    if isinstance(originals, list):
        for entry in originals:
             if isinstance(entry, dict):
                w = entry.get('word','')
                m = entry.get('meaning','')
                entry['word'] = m
                entry['meaning'] = w
    save_user_data()
    return jsonify({'success': True, 'words': words})

# (shuffle_api, sort_api, restore_api - 기존 로직 유지, 통합 구조 자동 적용됨)
@app.route('/api/words/shuffle', methods=['POST']) # 단어 섞기
def shuffle_api():
    data = request.get_json(); folder_path = data.get('path')
    folder_data = ensure_user_copy_exists(folder_path) # CoW
    if folder_data is None: return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404
    words = folder_data.setdefault('words', [])
    if not isinstance(words, list) or not words: return jsonify({'success': True, 'words': []})
    # 원본 없으면 현재 상태 저장 (이 로직은 섞기 전에 original_words가 최신 words와 같아야 함을 의미)
    # 만약 original_words가 정말 "초기 로드/추가 순서"를 유지해야 한다면, 이 부분은 수정 필요.
    # 현재는 섞기 직전의 words 상태를 original_words로 간주하는 것으로 보임.
    # restore_api 가 "original_words"를 사용하므로, 이 original_words가 어떤 시점의 words를 가리키는지가 중요.
    # 현재 코드의 의도는, shuffle/sort 전의 순서로 되돌리는 것으로 보임.
    if 'original_words' not in folder_data or not isinstance(folder_data.get('original_words'), list) or len(folder_data.get('original_words')) != len(words):
         print(f"[경고] 섞기 전 원본 재설정. 현재 상태 저장.");
         folder_data['original_words'] = [w.copy() for w in words]
    
    random.shuffle(words); folder_data['is_shuffled'] = True
    save_user_data()
    return jsonify({'success': True, 'words': words})

@app.route('/api/words/sort', methods=['POST']) # 단어 정렬
def sort_api():
    data = request.get_json(); folder_path = data.get('path'); key = data.get('key', 'word'); reverse = data.get('reverse', False)
    if key not in ['word', 'meaning']: return jsonify({'success': False, 'error': '정렬 키 오류'}), 400
    folder_data = ensure_user_copy_exists(folder_path) # CoW
    if folder_data is None: return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404
    words = folder_data.setdefault('words', [])
    if not isinstance(words, list) or not words: return jsonify({'success': True, 'words': []})
    
    # shuffle_api와 동일한 로직: 정렬 전 original_words 업데이트
    if 'original_words' not in folder_data or not isinstance(folder_data.get('original_words'), list) or len(folder_data.get('original_words')) != len(words):
         print(f"[경고] 정렬 전 원본 재설정. 현재 상태 저장.");
         folder_data['original_words'] = [w.copy() for w in words]

    try:
        words.sort(key=lambda x: str(x.get(key, '') or '').lower() if isinstance(x, dict) else '', reverse=reverse)
        folder_data['is_shuffled'] = False; # 정렬 후에는 셔플 상태 해제
        save_user_data();
        return jsonify({'success': True, 'words': words})
    except Exception as e: print(f"정렬 오류: {e}"); traceback.print_exc(); return jsonify({'success': False, 'error': f'정렬 오류: {e}'}), 500

@app.route('/api/words/restore', methods=['POST']) # 단어 원상 복귀 (순서)
def restore_api():
    data = request.get_json(); folder_path = data.get('path')
    folder_data = get_user_folder_data_by_path(folder_path) # 사용자 데이터 먼저 확인
    if folder_data is None:
        folder_data = ensure_user_copy_exists(folder_path)
        if folder_data is None: return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404
        if 'original_words' not in folder_data or not folder_data.get('original_words'): # CoW 후에도 원본 없으면 현재 words로
             folder_data['original_words'] = copy.deepcopy(folder_data.get('words', []))

    originals = folder_data.get('original_words')
    if not isinstance(originals, list): return jsonify({'success': False, 'error': '원본 데이터 없음/형식 오류'}), 400
    if not originals and isinstance(folder_data.get('words'), list): # 원본은 비었고 현재 words는 있으면 현재 words를 원본으로
        folder_data['original_words'] = copy.deepcopy(folder_data.get('words', []))
        originals = folder_data['original_words']
        print(f"[정보] '{folder_path}' 복원 시 original_words가 비어있어 현재 words로 대체합니다.")


    folder_data['words'] = [w.copy() for w in originals] # 원본을 현재 words로 복사
    folder_data['is_shuffled'] = False
    save_user_data()
    print(f"[백엔드 로그] 사용자 폴더 '{folder_path}' 단어 순서 원상 복귀 완료.")
    return jsonify({'success': True, 'words': folder_data['words']})

@app.route('/api/words/insert', methods=['POST']) # 단어 삽입
def insert_word_api():
    try:
        data = request.get_json(); folder_path = data.get('path'); index = data.get('index')
        word = data.get('word'); meaning = data.get('meaning'); part_of_speech = data.get('part_of_speech')

        if folder_path is None or index is None or word is None or meaning is None:
            return jsonify({'success': False, 'error': '정보 누락 (path, index, word, meaning 필수)'}), 400
        try: index = int(index)
        except (ValueError, TypeError): return jsonify({'success': False, 'error': 'index는 정수'}), 400

        folder_data = ensure_user_copy_exists(folder_path) # CoW
        if folder_data is None: return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404

        words = folder_data.setdefault('words', []); originals = folder_data.setdefault('original_words', [])
        if not isinstance(words, list): words = folder_data['words'] = []
        if not isinstance(originals, list): originals = folder_data['original_words'] = [w.copy() for w in words]
        if not (0 <= index <= len(words)): return jsonify({'success': False, 'error': '삽입 인덱스 오류 (words)'}), 400
        # original_words에 대한 인덱스 유효성도 중요
        # 만약 original_words가 words와 길이가 다르면 동기화 문제가 있을 수 있음.
        # 여기서는 words에 삽입하는 인덱스를 기준으로 original_words에도 삽입 시도
        if not (0 <= index <= len(originals)) and len(words) == len(originals): # words와 originals 길이가 같을 때만 인덱스 검사
            # 이 경우는 words와 originals가 동기화 안된 상태일 수 있음. 안전하게 끝에 추가하거나 오류.
            # 하지만 restore 등을 통해 words와 originals가 동기화되었다면 이 조건은 거의 발생 안함.
            print(f"[경고] 삽입 인덱스가 original_words 범위({len(originals)})를 벗어남: {index}. 조정 시도.")
            # 방어적으로 original_words의 길이에 맞게 index 조정 (이 경우 순서가 약간 달라질 수 있음)
            # 또는, original_words와 words가 동기화되지 않았음을 알리고 오류 반환 가능
            # 여기서는 original_words에 대한 삽입을 words 인덱스 기준으로 하되, 범위 벗어나면 끝에 추가
            pass


        entry = {
            "word": word.strip(),
            "meaning": meaning.strip(),
            "part_of_speech": (part_of_speech or "").strip() or None,
            "entries": [], # 삽입 시 상세 정보 없음
            "isStudied": False # 새로 삽입시 학습 안됨
        }
        words.insert(index, entry)
        
        # original_words에도 동일한 위치에 삽입 (만약 순서가 중요하다면)
        # is_shuffled가 False이고 정렬된 적 없다면 words와 original_words의 순서가 같다고 가정 가능.
        # 하지만 확실하지 않으므로, original_words에는 어떻게 삽입할지 정책 필요.
        # 여기서는 words와 동일한 인덱스에 삽입하되, 인덱스 오류 시 맨 뒤에 추가
        if 0 <= index <= len(originals):
            originals.insert(index, entry.copy())
        else:
            originals.append(entry.copy()) # 방어 코드

        save_user_data()
        return jsonify({'success': True, 'words': words})
    except Exception as e: print(f"[오류] 단어 삽입: {e}"); traceback.print_exc(); return jsonify({'success': False, 'error': f'삽입 오류: {e}'}), 500

@app.route('/api/words/restore_origin', methods=['POST']) # 원래 위치로 복원
def restore_origin_api():
    source_path = "복습 절실" # 항상 "복습 절실" 폴더에서 시작
    try:
        data = request.get_json(); index_in_review_words = data.get('wordIndex') # "복습 절실" 폴더의 words 리스트 내 인덱스
        if index_in_review_words is None: return jsonify({'success': False, 'error': 'index 누락'}), 400
        try: index_in_review_words = int(index_in_review_words)
        except (ValueError, TypeError): return jsonify({'success': False, 'error': 'index는 정수'}), 400
        
        src_folder = get_user_folder_data_by_path(source_path) # "복습 절실" 폴더 데이터 가져오기
        if src_folder is None: return jsonify({'success': False, 'error': f"'{source_path}' 폴더 없음"}), 404
        
        src_words = src_folder.setdefault('words', []); src_orig = src_folder.setdefault('original_words', [])
        if not isinstance(src_words, list) or not (0 <= index_in_review_words < len(src_words)): return jsonify({'success': False, 'error': '복습 절실 폴더 내 인덱스 오류'}), 400
        if not isinstance(src_orig, list): src_orig = src_folder['original_words'] = [w.copy() for w in src_words] # 방어

        word_to_restore_from_review_words = src_words.pop(index_in_review_words) # 복습 절실 words 리스트에서 제거
        if not isinstance(word_to_restore_from_review_words, dict): return jsonify({'success': False, 'error': '복원 대상 데이터 오류'}), 500

        original_folder_path = word_to_restore_from_review_words.get('originalPath')
        # 1번 요청: 원래 인덱스 사용
        original_index_in_src_words = word_to_restore_from_review_words.get('originalIndexInSrcWords')
        # original_index_in_src_originals = word_to_restore_from_review_words.get('originalIndexInSrcOriginals')


        if not original_folder_path: return jsonify({'success': False, 'error': '원래 위치 정보 없음'}), 400

        # 복습 절실 original_words 리스트에서도 해당 항목 삭제 (값 + originalPath 기반)
        src_orig_idx_to_delete = -1
        for i, ow_entry in enumerate(src_orig):
             if (isinstance(ow_entry, dict) and
                 ow_entry.get('word') == word_to_restore_from_review_words.get('word') and
                 ow_entry.get('meaning') == word_to_restore_from_review_words.get('meaning') and
                 ow_entry.get('originalPath') == word_to_restore_from_review_words.get('originalPath')):
                  src_orig_idx_to_delete = i; break
        if src_orig_idx_to_delete != -1:
            del src_orig[src_orig_idx_to_delete]
        else:
            print(f"[경고] 복원 단어의 복습 절실 original_words에서 못찾음: {word_to_restore_from_review_words}")

        # 원래 폴더 (타겟 폴더) 데이터 가져오기 (CoW)
        target_folder = ensure_user_copy_exists(original_folder_path)
        if target_folder is None: return jsonify({'success': False, 'error': f"원래 폴더 '{original_folder_path}' 접근/생성 실패"}), 404
        
        target_words = target_folder.setdefault('words', []); target_orig = target_folder.setdefault('original_words', [])
        if not isinstance(target_words, list): target_words = target_folder['words'] = []
        if not isinstance(target_orig, list): target_orig = target_folder['original_words'] = [w.copy() for w in target_words]

        restored_data = word_to_restore_from_review_words.copy()
        restored_data.pop('originalPath', None)
        restored_data.pop('originalIndexInSrcWords', None)
        # restored_data.pop('originalIndexInSrcOriginals', None)
        restored_data['isStudied'] = True # 복습하고 돌아왔으므로 학습 완료 처리

        # target_words에 삽입
        if original_index_in_src_words is not None and 0 <= original_index_in_src_words <= len(target_words):
            target_words.insert(original_index_in_src_words, restored_data)
        else:
            target_words.append(restored_data) # 인덱스 정보 없거나 유효하지 않으면 맨 뒤에 추가
            if original_index_in_src_words is not None:
                 print(f"[경고] 복원 시 target_words 인덱스({original_index_in_src_words})가 유효하지 않아 맨 뒤에 추가. (len: {len(target_words)})")


        # target_original_words에도 삽입 (더 복잡한 로직: 원래 original_words에서의 순서를 찾아야 함)
        # 만약 originalIndexInSrcOriginals 값이 있었다면 그걸 사용.
        # 여기서는 target_words와 동일한 로직으로 삽입 시도 (단, 이 경우 target_original_words의 순서가 깨질 수 있음)
        # 이상적으로는, target_original_words의 "원래" 순서를 유지해야 함.
        # "복습 절실"로 이동할 때, original_words에서의 인덱스도 저장했다가 그걸 사용하는 것이 더 정확.
        # 여기서는 originalIndexInSrcWords를 target_original_words에도 적용 시도
        # (만약 original_words가 항상 words의 셔플/정렬 전 상태라면 이 인덱스가 유효할 수 있음)
        
        # 좀 더 간단한 접근: target_original_words는 restore_api (단어 순서 원상 복귀)를 통해 관리되므로,
        # 여기서는 target_words에만 정확히 삽입하고, target_original_words는 해당 단어가 원래 있었다면 그 위치에,
        # 없었다면 (새로 생긴 단어라면) 맨 뒤에 추가하는 방식.
        # 또는, target_original_words에는 값 기반으로 찾아서 isStudied 플래그만 업데이트 하는 방법도 고려.
        
        # 현재는 target_words와 유사하게 target_orig에도 삽입 시도
        # (이 부분은 실제 사용 시 순서 보존 문제를 야기할 수 있으므로 주의 깊은 테스트 필요)
        temp_restored_data_for_orig = restored_data.copy()
        # original_words에는 isStudied 플래그를 반영하지 않거나, 초기값(False)으로 설정할 수 있음.
        # 여기서는 isStudied를 False로 하여, "원본"은 학습되지 않은 상태를 유지하도록 함.
        temp_restored_data_for_orig['isStudied'] = False 

        inserted_in_orig = False
        if original_index_in_src_words is not None and 0 <= original_index_in_src_words <= len(target_orig):
            # 해당 인덱스에 이미 다른 단어가 있는지 확인 (중복 방지)
            # 중복 체크는 복잡하므로, 일단 삽입.
            target_orig.insert(original_index_in_src_words, temp_restored_data_for_orig)
            inserted_in_orig = True
        
        if not inserted_in_orig: # 인덱스 정보가 없거나, 삽입 실패(범위 밖) 시
            # 값 기반으로 찾아서 업데이트 하거나, 맨 뒤에 추가
            found_in_orig_and_updated = False
            for ow_entry in target_orig:
                if isinstance(ow_entry, dict) and \
                   ow_entry.get('word') == temp_restored_data_for_orig.get('word') and \
                   ow_entry.get('meaning') == temp_restored_data_for_orig.get('meaning') and \
                   ow_entry.get('part_of_speech') == temp_restored_data_for_orig.get('part_of_speech'):
                    # isStudied만 업데이트 (또는 아무것도 안함. 원본은 원본이므로)
                    # 여기서는 원본의 isStudied는 False로 유지하는 것으로 했으므로, 값만 같은지 확인하고 특별히 업데이트 안 함.
                    # 만약 이 단어가 원래 original_words에 없었다면, 맨 뒤에 추가해야 함.
                    found_in_orig_and_updated = True # 이미 존재한다고 간주
                    break
            if not found_in_orig_and_updated:
                target_orig.append(temp_restored_data_for_orig)


        save_user_data()
        return jsonify({'success': True, 'words': src_words}) # 복습 절실 폴더 결과 반환
    except Exception as e: print(f"[오류] 단어 복원: {e}"); traceback.print_exc(); return jsonify({'success': False, 'error': f'복원 오류: {e}'}), 500


# (delete_multiple_api - 기존 로직 유지, 통합 구조 자동 적용)
@app.route('/api/words/delete_multiple', methods=['POST']) # 여러 단어 삭제
def delete_multiple_api():
    try:
        data = request.get_json(); folder_path = data.get('path'); indices_in_words = data.get('indices') # words 리스트 기준 인덱스
        if folder_path is None or indices_in_words is None: return jsonify({'success': False, 'error': '정보 누락'}), 400
        if not isinstance(indices_in_words, list): return jsonify({'success': False, 'error': 'indices는 리스트'}), 400
        
        folder_data = ensure_user_copy_exists(folder_path) # CoW
        if folder_data is None: return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404
        
        words = folder_data.setdefault('words', []); originals = folder_data.setdefault('original_words', [])
        if not isinstance(words, list): words = folder_data['words'] = []
        if not isinstance(originals, list): originals = folder_data['original_words'] = [w.copy() for w in words]

        # words 리스트에서 삭제할 인덱스들 (내림차순 정렬)
        valid_indices_in_words = sorted([idx for idx in indices_in_words if isinstance(idx, int) and 0 <= idx < len(words)], reverse=True)
        if not valid_indices_in_words: return jsonify({'success': False, 'error': '유효 인덱스 없음'}), 400

        deleted_items_info = [] # words에서 실제로 삭제된 항목들의 정보 저장 (original_words 검색용)
        for index in valid_indices_in_words:
            deleted_items_info.append(words.pop(index))

        # original_words 리스트에서도 해당 항목들 삭제 (값 기반)
        indices_to_delete_in_originals = []
        temp_originals_copy = originals[:] # 검색 중 원본 변경 방지 위해 복사본 사용

        for deleted_item in deleted_items_info:
            if not isinstance(deleted_item, dict): continue
            found_idx_in_temp_orig = -1
            for i in range(len(temp_originals_copy) - 1, -1, -1): # 뒤에서부터 탐색 (중복 시 마지막 것부터 매칭)
                ow_entry = temp_originals_copy[i]
                if isinstance(ow_entry, dict) and \
                   ow_entry.get('word') == deleted_item.get('word') and \
                   ow_entry.get('meaning') == deleted_item.get('meaning') and \
                   ow_entry.get('part_of_speech') == deleted_item.get('part_of_speech'):
                    found_idx_in_temp_orig = i
                    break
            
            if found_idx_in_temp_orig != -1:
                # 실제 originals 리스트에서의 인덱스를 찾아야 함.
                # temp_originals_copy에서 찾은 객체와 동일한 객체를 originals에서 찾아 인덱스 얻기 (또는 값으로 다시 찾기)
                # 여기서는 값으로 다시 찾되, 이미 삭제 예정인 인덱스는 제외.
                real_orig_idx = -1
                for k, real_ow_entry in enumerate(originals):
                    if k in indices_to_delete_in_originals: continue # 이미 삭제 예정이면 건너뛰기
                    if isinstance(real_ow_entry, dict) and \
                       real_ow_entry.get('word') == temp_originals_copy[found_idx_in_temp_orig].get('word') and \
                       real_ow_entry.get('meaning') == temp_originals_copy[found_idx_in_temp_orig].get('meaning') and \
                       real_ow_entry.get('part_of_speech') == temp_originals_copy[found_idx_in_temp_orig].get('part_of_speech'):
                        real_orig_idx = k
                        break
                
                if real_orig_idx != -1:
                    indices_to_delete_in_originals.append(real_orig_idx)
                    # temp_originals_copy에서도 제거하여 다음 검색 시 중복 방지 (선택적)
                    # 여기서는 temp_originals_copy를 변경하지 않고, real_orig_idx를 모으는 데만 집중
                else:
                     print(f"[경고] 다중 삭제: 원본 인덱스 못찾음 (중복 가능성 또는 temp_originals_copy 불일치): {deleted_item}")
            else:
                print(f"[경고] 다중 삭제: 삭제 단어의 원본을 original_words에서 못찾음: {deleted_item}")

        # 모아진 original_words 인덱스들을 내림차순 정렬 후 실제 삭제
        indices_to_delete_in_originals.sort(reverse=True)
        unique_indices_to_delete_in_originals = [] # 중복 제거
        for idx in indices_to_delete_in_originals:
            if idx not in unique_indices_to_delete_in_originals:
                unique_indices_to_delete_in_originals.append(idx)
        
        for idx in unique_indices_to_delete_in_originals:
            if 0 <= idx < len(originals):
                del originals[idx]
            else:
                print(f"[경고] 다중 삭제: 삭제할 original_words 인덱스 오류: {idx}")

        save_user_data()
        return jsonify({'success': True, 'words': words})
    except Exception as e: print(f"[오류] 여러 단어 삭제: {e}"); traceback.print_exc(); return jsonify({'success': False, 'error': f'삭제 오류: {e}'}), 500

# [수정됨] 단어 대량 추가: 통합 구조로 추가
@app.route('/api/words/bulk_add', methods=['POST'])
def bulk_add_api():
    try:
        data = request.get_json(); folder_path = data.get('path'); words_to_add = data.get('words')
        if not folder_path or not words_to_add or not isinstance(words_to_add, list): return jsonify({'success': False, 'error': '정보 누락 (path, words 리스트 필수)'}), 400

        folder_data = ensure_user_copy_exists(folder_path) # CoW
        if folder_data is None: return jsonify({'success': False, 'error': '폴더 접근/생성 실패'}), 404

        words = folder_data.setdefault('words', []); originals = folder_data.setdefault('original_words', [])
        if not isinstance(words, list): words = folder_data['words'] = []
        if not isinstance(originals, list): originals = folder_data['original_words'] = [w.copy() for w in words]

        added_count = 0
        for item in words_to_add:
            if isinstance(item, dict) and 'word' in item and 'meaning' in item:
                entry = {
                    "word": str(item.get('word','')).strip(),
                    "meaning": str(item.get('meaning','')).strip(),
                    "part_of_speech": str(item.get('part_of_speech','') or '').strip() or None,
                    "entries": copy.deepcopy(item.get('entries', [])) if isinstance(item.get('entries'), list) else [],
                    "isStudied": item.get('isStudied', False) # 대량 추가 시 isStudied 값도 받을 수 있도록
                }
                valid_entries = []
                if isinstance(entry['entries'], list):
                    for sub_item in entry['entries']:
                         if isinstance(sub_item, dict): valid_entries.append(sub_item)
                entry['entries'] = valid_entries

                words.append(entry); originals.append(entry.copy()); added_count += 1
            else:
                 print(f"[경고] 대량 추가 항목 형식 오류 (word, meaning 필수): {item}")

        folder_data['is_shuffled'] = False
        save_user_data()
        print(f"[백엔드 로그] 사용자 폴더 '{folder_path}' 단어 {added_count}개 대량 추가 완료.")
        return jsonify({'success': True, 'words': words})
    except Exception as e: print(f"[오류] 단어 대량 추가: {e}"); traceback.print_exc(); return jsonify({'success': False, 'error': f'대량 추가 오류: {e}'}), 500

@app.route('/api/words/move_multiple', methods=['POST'])
def move_multiple_words_api():
    try:
        data = request.get_json()
        source_path = data.get('sourcePath')
        target_path = data.get('targetPath')
        # wordIndices는 항상 리스트로 처리 (단일 이동 시에도 리스트에 1개만 담아서 보냄)
        word_indices_in_src_words = data.get('wordIndices')

        if not source_path or not target_path or word_indices_in_src_words is None:
            return jsonify({'success': False, 'error': '소스/타겟 경로 또는 단어 인덱스 누락'}), 400
        if not isinstance(word_indices_in_src_words, list):
            return jsonify({'success': False, 'error': '단어 인덱스는 리스트여야 합니다'}), 400
        if source_path == target_path:
            return jsonify({'success': False, 'error': '소스 폴더와 타겟 폴더가 동일할 수 없습니다'}), 400

        src_folder = ensure_user_copy_exists(source_path)
        if src_folder is None: return jsonify({'success': False, 'error': f"소스 폴더 '{source_path}' 접근/생성 실패"}), 404

        target_folder = ensure_user_copy_exists(target_path)
        if target_folder is None: return jsonify({'success': False, 'error': f"타겟 폴더 '{target_path}' 접근/생성 실패"}), 404

        src_words = src_folder.setdefault('words', [])
        src_originals = src_folder.setdefault('original_words', [])
        target_words = target_folder.setdefault('words', [])
        target_originals = target_folder.setdefault('original_words', [])

        # 인덱스는 내림차순으로 정렬하여 뒤에서부터 제거
        valid_indices = sorted([idx for idx in word_indices_in_src_words if isinstance(idx, int) and 0 <= idx < len(src_words)], reverse=True)
        if not valid_indices:
             return jsonify({'success': False, 'error': '유효한 이동 인덱스가 없습니다.'}), 400

        moved_words_data = [] # 실제로 이동된 단어들의 데이터 (original_words 처리용)

        for index_in_src in valid_indices:
            word_to_move = src_words.pop(index_in_src) # 소스 words에서 제거
            moved_words_data.append(word_to_move) # 이동된 단어 정보 저장

            target_entry = word_to_move.copy()

            # ★★★ 대상 폴더에 따른 처리 분기 ★★★
            if target_path == "복습 절실":
                target_entry.setdefault('originalPath', source_path)
                target_entry['originalIndexInSrcWords'] = index_in_src
                # isStudied 상태는 변경하지 않음 (복습 후 돌아올 때 변경)
            else: # "복습 절실" 외 다른 폴더로 이동 시
                target_entry.pop('originalPath', None)
                target_entry.pop('originalIndexInSrcWords', None)
                target_entry['isStudied'] = False # 다른 폴더로 가면 학습 안한 상태로 초기화

            target_words.append(target_entry) # 타겟 words에 추가 (맨 뒤)
            target_originals.append(target_entry.copy()) # 타겟 original_words에도 추가 (맨 뒤)

        # 소스 original_words에서도 해당 단어들 제거 (값 기반, 이전과 동일 로직)
        indices_to_delete_in_src_originals = []
        temp_src_originals_copy = src_originals[:]
        for item_data in reversed(moved_words_data):
            if not isinstance(item_data, dict): continue
            found_idx_in_temp_src_orig = -1
            for i in range(len(temp_src_originals_copy) - 1, -1, -1):
                ow_entry = temp_src_originals_copy[i]
                if isinstance(ow_entry, dict) and \
                   ow_entry.get('word') == item_data.get('word') and \
                   ow_entry.get('meaning') == item_data.get('meaning') and \
                   ow_entry.get('part_of_speech') == item_data.get('part_of_speech'):
                    # 좀 더 정확하게 하려면 isStudied 등 다른 플래그도 비교할 수 있으나,
                    # 이동 전 상태 기준으로 찾는 것이므로 word/meaning/pos 정도로 충분할 수 있음
                    found_idx_in_temp_src_orig = i
                    break
            if found_idx_in_temp_src_orig != -1:
                real_orig_idx = -1
                for k, real_ow_entry in enumerate(src_originals):
                    if k in indices_to_delete_in_src_originals: continue
                    if isinstance(real_ow_entry, dict) and \
                       real_ow_entry.get('word') == temp_src_originals_copy[found_idx_in_temp_src_orig].get('word') and \
                       real_ow_entry.get('meaning') == temp_src_originals_copy[found_idx_in_temp_src_orig].get('meaning') and \
                       real_ow_entry.get('part_of_speech') == temp_src_originals_copy[found_idx_in_temp_src_orig].get('part_of_speech'):
                        real_orig_idx = k
                        break
                if real_orig_idx != -1:
                    indices_to_delete_in_src_originals.append(real_orig_idx)
                else:
                    print(f"[경고] 다중 이동(수정): 소스 original_words 실제 인덱스 못찾음: {item_data}")
            else:
                 print(f"[경고] 다중 이동(수정): 소스 original_words에서 단어 못찾음: {item_data}")

        indices_to_delete_in_src_originals.sort(reverse=True)
        unique_indices_to_delete_in_src_originals = []
        for idx in indices_to_delete_in_src_originals:
            if idx not in unique_indices_to_delete_in_src_originals:
                unique_indices_to_delete_in_src_originals.append(idx)

        for idx in unique_indices_to_delete_in_src_originals:
            if 0 <= idx < len(src_originals):
                del src_originals[idx]

        save_user_data()
        return jsonify({'success': True, 'sourceWords': src_words, 'targetWords': target_words, 'message': f'{len(valid_indices)}개 단어 이동 완료.'})

    except Exception as e:
        print(f"[오류] 단어 다중 이동: {e}"); traceback.print_exc()
        return jsonify({'success': False, 'error': f'다중 이동 오류: {e}'}), 500
# --- 다중 이동 API 수정 끝 ---


# --- TTS API (변경 없음) ---
@app.route('/api/tts', methods=['POST'])
def generate_tts():
    if not tts_client: return jsonify({"success": False, "error": "TTS 서비스를 사용할 수 없습니다."}), 503
    try:
        data = request.get_json(); text = data.get('text'); language_code = data.get('language_code', 'en-US'); voice_name = data.get('voice_name')
        if not text: return jsonify({"success": False, "error": "텍스트 필요"}), 400
        print(f"[DEBUG] TTS 요청: Text='{text[:30]}...', Lang='{language_code}', Voice='{voice_name}'")
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice_params = texttospeech.VoiceSelectionParams(language_code=language_code)
        if voice_name: voice_params.name = voice_name
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
        response = tts_client.synthesize_speech(input=synthesis_input, voice=voice_params, audio_config=audio_config)
        print("[DEBUG] TTS 생성 성공, 오디오 데이터 반환")
        return Response(response.audio_content, mimetype='audio/mpeg')
    except google_exceptions.GoogleAPICallError as e:
         print(f"[백엔드 로그][오류] Google TTS API 호출 오류: {e}")
         error_message = f"TTS API 호출 중 오류 발생: {e.message if hasattr(e, 'message') else e}"; status_code = 500
         if hasattr(e, 'code') and 400 <= e.code < 500:
             status_code = e.code
             if e.code == 400: error_message = "잘못된 TTS 요청 파라미터입니다 (언어/목소리 등)."
             elif e.code == 401 or e.code == 403: error_message = "TTS 서비스 인증/권한 오류입니다."
             elif e.code == 429: error_message = "TTS 사용량 한도를 초과했습니다."
         elif "API key not valid" in str(e): error_message = "TTS 서비스 인증 실패 (API 키 확인)."; status_code = 401
         return jsonify({"success": False, "error": error_message}), status_code
    except Exception as e:
        print(f"[백엔드 로그][오류] TTS 생성 중 예상치 못한 오류: {e}"); traceback.print_exc()
        return jsonify({"success": False, "error": "TTS 생성 중 내부 서버 오류 발생"}), 500

# --- 백업 관련 API (사용자 데이터만 대상) ---
@app.route('/api/backup_data', methods=['GET'])
def get_backup_data():
    try:
        check_and_update_folder_structure(user_folders) # 최신 상태 확인
        backup_data = copy.deepcopy(user_folders) # 사용자 데이터만 백업
        return jsonify(backup_data)
    except Exception as e: print(f"백업 데이터 생성 오류: {e}"); traceback.print_exc(); return jsonify({"error": "백업 데이터 생성 실패"}), 500

@app.route('/api/folders/restore_backup', methods=['POST'])
def restore_backup_data():
    global user_folders
    try:
        backup_data = request.get_json()
        if not isinstance(backup_data, dict): return jsonify({"success": False, "error": "잘못된 백업 데이터 형식"}), 400
        # ★★★ 복원 전 데이터 구조 검사 및 보정 ★★★
        restored_data_checked = copy.deepcopy(backup_data)
        check_and_update_folder_structure(restored_data_checked)
        user_folders = restored_data_checked # 검증된 데이터로 교체
        # "복습 절실" 폴더 존재 보장
        if "복습 절실" not in user_folders:
            user_folders["복습 절실"] = {"name": "복습 절실", "words": [], "original_words": [], "is_shuffled": False, "children": {}, "isDefault": False}
            check_and_update_folder_structure(user_folders) # 추가 후에도 구조 확인
        save_user_data() # 복원된 데이터 저장
        print("[백엔드 로그] 백업 데이터 복원 완료.")
        # 복원 후 최신 폴더 목록 반환
        merged = merge_folder_trees(copy.deepcopy(default_folders), user_folders)
        return jsonify({'success': True, 'folders': get_folder_list_recursive(merged)})
    except Exception as e: print(f"백업 복원 오류: {e}"); traceback.print_exc(); return jsonify({"success": False, "error": f"백업 복원 중 오류 발생: {e}"}), 500


# --- 앱 실행 부분 ---
if __name__ == '__main__':
    print("로컬 개발 서버 시작 (디버그 모드 활성화)...")
    app.run(host='0.0.0.0', port=5000, debug=True) # 디버그 모드 주의




