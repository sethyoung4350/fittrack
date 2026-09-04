/* FitTrack — tiny IndexedDB wrapper. Stores: nutrition, sessions, program, notes, photos. */
'use strict';

const DB_NAME = 'fittrack';
const DB_VERSION = 1;
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise(function (resolve, reject) {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function () {
      const db = req.result;
      if (!db.objectStoreNames.contains('nutrition')) {
        db.createObjectStore('nutrition', { keyPath: 'id', autoIncrement: true }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('program')) {
        db.createObjectStore('program', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true }).createIndex('date', 'date');
      }
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error || new Error('Could not open IndexedDB')); };
  });
  return _dbPromise;
}

function _tx(storeName, mode, run) {
  return openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      const req = run(store);
      if (req && 'onsuccess' in req) {
        req.onsuccess = function () { result = req.result; };
      }
      tx.oncomplete = function () { resolve(result); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('Transaction aborted')); };
    });
  });
}

function dbGetAll(storeName) { return _tx(storeName, 'readonly', function (s) { return s.getAll(); }); }
function dbGet(storeName, key) { return _tx(storeName, 'readonly', function (s) { return s.get(key); }); }
function dbPut(storeName, value) { return _tx(storeName, 'readwrite', function (s) { return s.put(value); }); }
function dbDelete(storeName, key) { return _tx(storeName, 'readwrite', function (s) { return s.delete(key); }); }
function dbClear(storeName) { return _tx(storeName, 'readwrite', function (s) { return s.clear(); }); }
