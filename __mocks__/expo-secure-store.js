const _store = {};
module.exports = {
  getItemAsync: jest.fn(async (key) => _store[key] ?? null),
  setItemAsync: jest.fn(async (key, val) => { _store[key] = val; }),
  deleteItemAsync: jest.fn(async (key) => { delete _store[key]; }),
  _store,
};
