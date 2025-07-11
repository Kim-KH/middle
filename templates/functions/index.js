const functions = require("firebase-functions");
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const cors = require("cors")({ origin: true });

const ttsClient = new TextToSpeechClient();

exports.generateTts = functions.https.onRequest((request, response) => {
  cors(request, response, async () => {
    if (request.method !== "POST") {
      return response.status(405).send("Method Not Allowed");
    }

    try {
      const { text, languageCode, voiceName } = request.body;
      if (!text || !languageCode) {
        return response.status(400).send("Missing text or languageCode");
      }

      const synthesisInput = { text: text };
      const voice = { languageCode: languageCode };
      if (voiceName) {
        voice.name = voiceName;
      }
      const audioConfig = { audioEncoding: "MP3" };

      const [ttsResponse] = await ttsClient.synthesizeSpeech({
        input: synthesisInput,
        voice: voice,
        audioConfig: audioConfig,
      });

      response.set("Content-Type", "audio/mpeg");
      response.send(ttsResponse.audioContent);

    } catch (error) {
      console.error("TTS Generation Error:", error);
      response.status(500).send("Error generating speech.");
    }
  });
});