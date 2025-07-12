from firebase_functions import https_fn
from firebase_admin import initialize_app
from google.cloud import texttospeech

# Firebase 앱 초기화
initialize_app()

# ★★★ 중요: 여기에 region과 runtime을 직접 지정합니다 ★★★
@https_fn.on_request(region="us-central1", runtime="python312")
def generateTts(req: https_fn.Request) -> https_fn.Response:
    """
    HTTP 요청을 받아 텍스트를 음성으로 변환하는 함수.
    """
    
    # CORS 헤더 설정
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    # CORS preflight 요청 처리
    if req.method == "OPTIONS":
        return https_fn.Response("", headers=headers)

    # 요청 데이터 확인
    try:
        data = req.get_json()
        text_to_speak = data.get("text")
        language_code = data.get("language_code")
        voice_name = data.get("voice_name")
        
        if not all([text_to_speak, language_code, voice_name]):
            raise KeyError("필수 키가 누락되었습니다.")

    except (KeyError, TypeError, AttributeError):
        return https_fn.Response("요청 형식이 잘못되었습니다. 'text', 'language_code', 'voice_name' 키가 필요합니다.", status=400, headers=headers)

    try:
        # Text-to-Speech 클라이언트 초기화
        client = texttospeech.TextToSpeechClient()

        synthesis_input = texttospeech.SynthesisInput(text=text_to_speak)
        voice = texttospeech.VoiceSelectionParams(language_code=language_code, name=voice_name)
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)

        # TTS API 호출
        response = client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)

        # 생성된 오디오 데이터를 응답으로 반환
        return https_fn.Response(
            response.audio_content,
            headers=headers,
            mimetype="audio/mpeg"
        )
    except Exception as e:
        print(f"An error occurred: {e}")
        return https_fn.Response(f"서버 내부 오류 발생: {e}", status=500, headers=headers)