import json
import os

# 입력 파일 목록과 최종 출력 파일 이름 설정
# (파일 이름이 다르면 이 부분을 수정하세요)
INPUT_FILES = {
    "기초 단어": "basic.txt",
    "중학 단어": "middle_school.txt"
}
OUTPUT_JSON_FILE = 'default_vocabulary.json'

def parse_txt_file(input_file):
    """3줄 단위의 텍스트 파일을 읽어 단어 객체 리스트로 변환합니다."""
    word_list = []
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            # 파일의 모든 줄을 읽어 앞뒤 공백을 제거하고, 빈 줄은 제외합니다.
            lines = [line.strip() for line in f.readlines() if line.strip()]

        # 3줄씩 묶어서 처리
        for i in range(0, len(lines), 3):
            if i + 2 < len(lines):
                word_line = lines[i]
                example_line = lines[i+1]
                translation_line = lines[i+2]
                
                # '단어: 의미' 형식의 첫 줄을 분리합니다.
                word_parts = word_line.split(':', 1) # 첫 번째 ':'만 기준으로 분리
                word = word_parts[0].strip()
                meaning = word_parts[1].strip() if len(word_parts) > 1 else ""

                # 최종 JSON 객체 생성
                word_entry = {
                    "word": word,
                    "meaning": meaning,
                    "part_of_speech": None, # 이 형식의 txt 파일에는 품사 정보가 별도로 없음
                    "entries": [
                        {
                            "definition": meaning, # 뜻을 definition에도 넣어줌
                            "example": example_line,
                            "translation": translation_line
                        }
                    ],
                    "isStudied": False,
                    "knowledgeState": "unknown"
                }
                word_list.append(word_entry)
    except FileNotFoundError:
        print(f"오류: 입력 파일 '{input_file}'을 찾을 수 없습니다. 건너<0xEB><0x9C><0x9C>니다.")
        return []
    except Exception as e:
        print(f"'{input_file}' 처리 중 오류 발생: {e}")
        return []
        
    return word_list

# --- 메인 실행 부분 ---
print("단어 데이터 변환을 시작합니다...")

# 최종 JSON 구조를 담을 딕셔너리
final_json_structure = {
    "공통학습": {
        "name": "공통학습",
        "isDefault": True,
        "children": {}  # 하위 폴더들을 여기에 추가
    }
}

# 각 입력 파일을 순회하며 처리
for folder_name, filename in INPUT_FILES.items():
    print(f"-> '{filename}' 파일을 처리 중...")
    words = parse_txt_file(filename)
    
    if words:
        # "공통학습" 폴더 아래에 각 파일별로 하위 폴더 생성
        final_json_structure["공통학습"]["children"][folder_name] = {
            "name": folder_name,
            "isDefault": True,
            "words": words,
            "original_words": [w.copy() for w in words],
            "is_shuffled": False,
            "children": {}
        }
        print(f"   '{filename}'에서 {len(words)}개의 단어를 '{folder_name}' 폴더에 추가했습니다.")
    else:
        print(f"   '{filename}'에서 처리할 단어가 없습니다.")

# 최종 JSON 파일로 저장
try:
    output_dir = os.path.join("static", "defaults")
    os.makedirs(output_dir, exist_ok=True) # static/defaults 폴더가 없으면 생성
    output_path = os.path.join(output_dir, OUTPUT_JSON_FILE)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(final_json_structure, f, ensure_ascii=False, indent=4)
    print(f"\n성공! 모든 단어가 '{output_path}' 파일로 저장되었습니다.")
except Exception as e:
    print(f"JSON 파일 저장 중 오류 발생: {e}")