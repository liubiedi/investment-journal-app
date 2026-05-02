const Voice = {
  onSpeechResults: null,
  onSpeechPartialResults: null,
  onSpeechEnd: null,
  onSpeechError: null,
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn().mockResolvedValue(undefined),
  removeAllListeners: jest.fn(),
  requestSpeechRecognitionPermission: jest.fn().mockResolvedValue("granted"),
};

module.exports = { default: Voice };
