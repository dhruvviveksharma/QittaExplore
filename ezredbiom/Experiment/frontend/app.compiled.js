"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
var _document$querySelect;
function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var _React = React,
  useState = _React.useState,
  useEffect = _React.useEffect,
  useRef = _React.useRef,
  useMemo = _React.useMemo,
  useCallback = _React.useCallback;
var API = ((_document$querySelect = document.querySelector('meta[name="api-base"]')) === null || _document$querySelect === void 0 ? void 0 : _document$querySelect.content) || 'http://localhost:5001/api';
var USER_ID = 'default';

// ─── helpers ──────────────────────────────────────────────────────────────────
var apiFetch = function apiFetch(path) {
  var opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  return fetch("".concat(API).concat(path), _objectSpread({
    headers: {
      'Content-Type': 'application/json'
    }
  }, opts));
};
var apiPost = function apiPost(path, body) {
  return apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(body)
  });
};
var apiDel = function apiDel(path) {
  return apiFetch(path, {
    method: 'DELETE'
  });
};
function parseSSE(_x, _x2, _x3) {
  return _parseSSE.apply(this, arguments);
} // ─── Root ─────────────────────────────────────────────────────────────────────
function _parseSSE() {
  _parseSSE = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee19(response, _ref, signal) {
    var onToken, onDone, onError, reader, dec, buf, _yield$reader$read, value, done, i, raw, type, data, _iterator, _step, ln, payload;
    return _regenerator().w(function (_context19) {
      while (1) switch (_context19.n) {
        case 0:
          onToken = _ref.onToken, onDone = _ref.onDone, onError = _ref.onError;
          reader = response.body.getReader();
          dec = new TextDecoder();
          buf = '';
        case 1:
          if (!true) {
            _context19.n = 5;
            break;
          }
          if (!(signal !== null && signal !== void 0 && signal.aborted)) {
            _context19.n = 2;
            break;
          }
          return _context19.a(3, 5);
        case 2:
          _context19.n = 3;
          return reader.read();
        case 3:
          _yield$reader$read = _context19.v;
          value = _yield$reader$read.value;
          done = _yield$reader$read.done;
          if (!done) {
            _context19.n = 4;
            break;
          }
          return _context19.a(3, 5);
        case 4:
          buf += dec.decode(value, {
            stream: true
          });
          i = void 0;
          while ((i = buf.indexOf('\n\n')) !== -1) {
            raw = buf.slice(0, i);
            buf = buf.slice(i + 2);
            type = 'message', data = '{}';
            _iterator = _createForOfIteratorHelper(raw.split('\n'));
            try {
              for (_iterator.s(); !(_step = _iterator.n()).done;) {
                ln = _step.value;
                if (ln.startsWith('event:')) type = ln.slice(6).trim();
                if (ln.startsWith('data:')) data = ln.slice(5).trim();
              }
            } catch (err) {
              _iterator.e(err);
            } finally {
              _iterator.f();
            }
            payload = {};
            try {
              payload = JSON.parse(data);
            } catch (_) {}
            if (type === 'token' && onToken) onToken(payload);
            if (type === 'done' && onDone) onDone(payload);
            if (type === 'error' && onError) onError(payload);
          }
          _context19.n = 1;
          break;
        case 5:
          return _context19.a(2);
      }
    }, _callee19);
  }));
  return _parseSSE.apply(this, arguments);
}
function App() {
  var _chatCache$view$chatI, _activeMsgs, _openProject$studies, _openProject$studies2, _projects$find, _openProject$studies3;
  // Projects list (sidebar)
  var _useState = useState([]),
    _useState2 = _slicedToArray(_useState, 2),
    projects = _useState2[0],
    setProjects = _useState2[1];
  var _useState3 = useState(true),
    _useState4 = _slicedToArray(_useState3, 2),
    projLoading = _useState4[0],
    setProjLoading = _useState4[1];

  // Which project folder is open in sidebar
  var _useState5 = useState(null),
    _useState6 = _slicedToArray(_useState5, 2),
    openProjId = _useState6[0],
    setOpenProjId = _useState6[1];
  var _useState7 = useState(null),
    _useState8 = _slicedToArray(_useState7, 2),
    openProject = _useState8[0],
    setOpenProject = _useState8[1]; // full detail incl studies+chats

  // Active view object
  // { type: 'project-chat', projId, chatId }
  // { type: 'global-chat',  chatId }
  // { type: 'browse' }
  var _useState9 = useState({
      type: 'browse'
    }),
    _useState0 = _slicedToArray(_useState9, 2),
    view = _useState0[0],
    setView = _useState0[1];

  // Chat message cache keyed by chatId — never reset on re-render
  var _useState1 = useState({}),
    _useState10 = _slicedToArray(_useState1, 2),
    chatCache = _useState10[0],
    setChatCache = _useState10[1];

  // Global chats
  var _useState11 = useState([]),
    _useState12 = _slicedToArray(_useState11, 2),
    globalChats = _useState12[0],
    setGlobalChats = _useState12[1];

  // Per-project folder inner tab
  var _useState13 = useState('chats'),
    _useState14 = _slicedToArray(_useState13, 2),
    projInnerTab = _useState14[0],
    setProjInnerTab = _useState14[1];

  // Browse / search
  var _useState15 = useState(''),
    _useState16 = _slicedToArray(_useState15, 2),
    query = _useState16[0],
    setQuery = _useState16[1];
  var _useState17 = useState([]),
    _useState18 = _slicedToArray(_useState17, 2),
    results = _useState18[0],
    setResults = _useState18[1];
  var _useState19 = useState([]),
    _useState20 = _slicedToArray(_useState19, 2),
    firstStudies = _useState20[0],
    setFirstStudies = _useState20[1];
  var _useState21 = useState(false),
    _useState22 = _slicedToArray(_useState21, 2),
    searching = _useState22[0],
    setSearching = _useState22[1];
  var _useState23 = useState(false),
    _useState24 = _slicedToArray(_useState23, 2),
    searched = _useState24[0],
    setSearched = _useState24[1];
  var _useState25 = useState(null),
    _useState26 = _slicedToArray(_useState25, 2),
    sqlQuery = _useState26[0],
    setSqlQuery = _useState26[1];
  var _useState27 = useState(false),
    _useState28 = _slicedToArray(_useState27, 2),
    showSql = _useState28[0],
    setShowSql = _useState28[1];

  // Global chat context studies
  var _useState29 = useState([]),
    _useState30 = _slicedToArray(_useState29, 2),
    ctxStudies = _useState30[0],
    setCtxStudies = _useState30[1];

  // New project form
  var _useState31 = useState(false),
    _useState32 = _slicedToArray(_useState31, 2),
    showNewProj = _useState32[0],
    setShowNewProj = _useState32[1];
  var _useState33 = useState(''),
    _useState34 = _slicedToArray(_useState33, 2),
    newProjName = _useState34[0],
    setNewProjName = _useState34[1];

  // Composer
  var _useState35 = useState(''),
    _useState36 = _slicedToArray(_useState35, 2),
    input = _useState36[0],
    setInput = _useState36[1];
  var _useState37 = useState(false),
    _useState38 = _slicedToArray(_useState37, 2),
    sending = _useState38[0],
    setSending = _useState38[1];
  var _useState39 = useState(''),
    _useState40 = _slicedToArray(_useState39, 2),
    compErr = _useState40[0],
    setCompErr = _useState40[1];

  // Study detail modal
  var _useState41 = useState(null),
    _useState42 = _slicedToArray(_useState41, 2),
    modalStudy = _useState42[0],
    setModalStudy = _useState42[1];
  var _useState43 = useState(null),
    _useState44 = _slicedToArray(_useState43, 2),
    modalDetail = _useState44[0],
    setModalDetail = _useState44[1]; // {preps, artifacts} or null
  var _useState45 = useState(false),
    _useState46 = _slicedToArray(_useState45, 2),
    modalDetailLoading = _useState46[0],
    setModalDetailLoading = _useState46[1];
  var _useState47 = useState(null),
    _useState48 = _slicedToArray(_useState47, 2),
    samplePreview = _useState48[0],
    setSamplePreview = _useState48[1]; // {sample_id, fields}
  var _useState49 = useState(false),
    _useState50 = _slicedToArray(_useState49, 2),
    samplePreviewLoading = _useState50[0],
    setSamplePreviewLoading = _useState50[1];
  var abortRef = useRef(null);
  var taRef = useRef(null);
  var bottomRef = useRef(null);
  var modalAbortRef = useRef(null);

  // ── auto-size textarea ───────────────────────────────────────────────────────
  useEffect(function () {
    if (!taRef.current) return;
    taRef.current.style.height = '0';
    taRef.current.style.height = Math.min(200, taRef.current.scrollHeight) + 'px';
  }, [input]);

  // ── scroll to bottom on new tokens ──────────────────────────────────────────
  var activeMsgs = view.chatId ? ((_chatCache$view$chatI = chatCache[view.chatId]) === null || _chatCache$view$chatI === void 0 ? void 0 : _chatCache$view$chatI.messages) || [] : [];
  var lastContent = (_activeMsgs = activeMsgs[activeMsgs.length - 1]) === null || _activeMsgs === void 0 ? void 0 : _activeMsgs.content;
  useEffect(function () {
    var _bottomRef$current;
    (_bottomRef$current = bottomRef.current) === null || _bottomRef$current === void 0 || _bottomRef$current.scrollIntoView({
      behavior: 'smooth'
    });
  }, [activeMsgs.length, lastContent]);

  // ── cleanup ──────────────────────────────────────────────────────────────────
  useEffect(function () {
    return function () {
      var _abortRef$current;
      return (_abortRef$current = abortRef.current) === null || _abortRef$current === void 0 ? void 0 : _abortRef$current.abort();
    };
  }, []);

  // ── initial load ─────────────────────────────────────────────────────────────
  useEffect(function () {
    loadProjects();
    loadGlobalChats();
    loadFirstStudies();
  }, []);

  // ── when openProjId changes, fetch its detail ─────────────────────────────
  useEffect(function () {
    if (!openProjId) {
      setOpenProject(null);
      return;
    }
    fetchProjectDetail(openProjId);
  }, [openProjId]);

  // ─── loaders ──────────────────────────────────────────────────────────────────
  var loadProjects = /*#__PURE__*/function () {
    var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
      var res, d;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.p = _context.n) {
          case 0:
            setProjLoading(true);
            _context.p = 1;
            _context.n = 2;
            return apiFetch("/projects?user_id=".concat(USER_ID));
          case 2:
            res = _context.v;
            if (!res.ok) {
              _context.n = 4;
              break;
            }
            _context.n = 3;
            return res.json();
          case 3:
            d = _context.v;
            setProjects(d.projects || []);
          case 4:
            _context.p = 4;
            setProjLoading(false);
            return _context.f(4);
          case 5:
            return _context.a(2);
        }
      }, _callee, null, [[1,, 4, 5]]);
    }));
    return function loadProjects() {
      return _ref2.apply(this, arguments);
    };
  }();
  var fetchProjectDetail = /*#__PURE__*/function () {
    var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(pid) {
      var res, _t;
      return _regenerator().w(function (_context2) {
        while (1) switch (_context2.n) {
          case 0:
            _context2.n = 1;
            return apiFetch("/projects/".concat(pid, "?user_id=").concat(USER_ID));
          case 1:
            res = _context2.v;
            if (!res.ok) {
              _context2.n = 3;
              break;
            }
            _t = setOpenProject;
            _context2.n = 2;
            return res.json();
          case 2:
            _t(_context2.v);
          case 3:
            return _context2.a(2);
        }
      }, _callee2);
    }));
    return function fetchProjectDetail(_x4) {
      return _ref3.apply(this, arguments);
    };
  }();
  var loadGlobalChats = /*#__PURE__*/function () {
    var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3() {
      var res, d;
      return _regenerator().w(function (_context3) {
        while (1) switch (_context3.n) {
          case 0:
            _context3.n = 1;
            return apiFetch("/global-chats?user_id=".concat(USER_ID));
          case 1:
            res = _context3.v;
            if (!res.ok) {
              _context3.n = 3;
              break;
            }
            _context3.n = 2;
            return res.json();
          case 2:
            d = _context3.v;
            setGlobalChats(d.chats || []);
          case 3:
            return _context3.a(2);
        }
      }, _callee3);
    }));
    return function loadGlobalChats() {
      return _ref4.apply(this, arguments);
    };
  }();
  var loadFirstStudies = /*#__PURE__*/function () {
    var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4() {
      var res, d;
      return _regenerator().w(function (_context4) {
        while (1) switch (_context4.n) {
          case 0:
            _context4.n = 1;
            return apiFetch('/studies/first?limit=20');
          case 1:
            res = _context4.v;
            if (!res.ok) {
              _context4.n = 3;
              break;
            }
            _context4.n = 2;
            return res.json();
          case 2:
            d = _context4.v;
            setFirstStudies(d.results || []);
          case 3:
            return _context4.a(2);
        }
      }, _callee4);
    }));
    return function loadFirstStudies() {
      return _ref5.apply(this, arguments);
    };
  }();

  // Load a single chat into cache (only if not already present)
  var hydrateChatCache = /*#__PURE__*/function () {
    var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(type, projId, chatId) {
      var res, d, _t2;
      return _regenerator().w(function (_context5) {
        while (1) switch (_context5.n) {
          case 0:
            if (!chatCache[chatId]) {
              _context5.n = 1;
              break;
            }
            return _context5.a(2);
          case 1:
            if (!(type === 'project-chat')) {
              _context5.n = 3;
              break;
            }
            _context5.n = 2;
            return apiFetch("/projects/".concat(projId, "/chats/").concat(chatId, "?user_id=").concat(USER_ID));
          case 2:
            _t2 = _context5.v;
            _context5.n = 5;
            break;
          case 3:
            _context5.n = 4;
            return apiFetch("/global-chats/".concat(chatId, "?user_id=").concat(USER_ID));
          case 4:
            _t2 = _context5.v;
          case 5:
            res = _t2;
            if (!res.ok) {
              _context5.n = 7;
              break;
            }
            _context5.n = 6;
            return res.json();
          case 6:
            d = _context5.v;
            setChatCache(function (prev) {
              return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, chatId, {
                messages: d.messages || [],
                title: d.title
              }));
            });
          case 7:
            return _context5.a(2);
        }
      }, _callee5);
    }));
    return function hydrateChatCache(_x5, _x6, _x7) {
      return _ref6.apply(this, arguments);
    };
  }();

  // ─── project actions ───────────────────────────────────────────────────────────
  var createProject = /*#__PURE__*/function () {
    var _ref7 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6() {
      var name, res, proj;
      return _regenerator().w(function (_context6) {
        while (1) switch (_context6.n) {
          case 0:
            name = newProjName.trim() || 'Untitled';
            _context6.n = 1;
            return apiPost('/projects', {
              user_id: USER_ID,
              name: name
            });
          case 1:
            res = _context6.v;
            if (res.ok) {
              _context6.n = 2;
              break;
            }
            return _context6.a(2);
          case 2:
            _context6.n = 3;
            return res.json();
          case 3:
            proj = _context6.v;
            setNewProjName('');
            setShowNewProj(false);
            _context6.n = 4;
            return loadProjects();
          case 4:
            setOpenProjId(proj.project_id);
            setProjInnerTab('chats');
          case 5:
            return _context6.a(2);
        }
      }, _callee6);
    }));
    return function createProject() {
      return _ref7.apply(this, arguments);
    };
  }();
  var deleteProject = /*#__PURE__*/function () {
    var _ref8 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7(pid) {
      return _regenerator().w(function (_context7) {
        while (1) switch (_context7.n) {
          case 0:
            if (confirm('Delete this project and all its chats?')) {
              _context7.n = 1;
              break;
            }
            return _context7.a(2);
          case 1:
            _context7.n = 2;
            return apiDel("/projects/".concat(pid, "?user_id=").concat(USER_ID));
          case 2:
            if (openProjId === pid) {
              setOpenProjId(null);
              setOpenProject(null);
            }
            if (view.projId === pid) setView({
              type: 'browse'
            });
            loadProjects();
          case 3:
            return _context7.a(2);
        }
      }, _callee7);
    }));
    return function deleteProject(_x8) {
      return _ref8.apply(this, arguments);
    };
  }();
  var addStudyToProject = /*#__PURE__*/function () {
    var _ref9 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee8(study) {
      var res, updated;
      return _regenerator().w(function (_context8) {
        while (1) switch (_context8.n) {
          case 0:
            if (openProjId) {
              _context8.n = 1;
              break;
            }
            return _context8.a(2);
          case 1:
            _context8.n = 2;
            return apiPost("/projects/".concat(openProjId, "/studies"), {
              user_id: USER_ID,
              study: study
            });
          case 2:
            res = _context8.v;
            if (!res.ok) {
              _context8.n = 4;
              break;
            }
            _context8.n = 3;
            return res.json();
          case 3:
            updated = _context8.v;
            setOpenProject(updated);
          case 4:
            return _context8.a(2);
        }
      }, _callee8);
    }));
    return function addStudyToProject(_x9) {
      return _ref9.apply(this, arguments);
    };
  }();
  var removeStudy = /*#__PURE__*/function () {
    var _ref0 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee9(studyId) {
      var res, updated;
      return _regenerator().w(function (_context9) {
        while (1) switch (_context9.n) {
          case 0:
            if (openProjId) {
              _context9.n = 1;
              break;
            }
            return _context9.a(2);
          case 1:
            _context9.n = 2;
            return apiDel("/projects/".concat(openProjId, "/studies/").concat(studyId, "?user_id=").concat(USER_ID));
          case 2:
            res = _context9.v;
            if (!res.ok) {
              _context9.n = 4;
              break;
            }
            _context9.n = 3;
            return res.json();
          case 3:
            updated = _context9.v;
            setOpenProject(updated);
          case 4:
            return _context9.a(2);
        }
      }, _callee9);
    }));
    return function removeStudy(_x0) {
      return _ref0.apply(this, arguments);
    };
  }();

  // ─── chat navigation (no full re-render / no reload) ──────────────────────────
  var openProjChat = /*#__PURE__*/function () {
    var _ref1 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee0(projId, chatId) {
      return _regenerator().w(function (_context0) {
        while (1) switch (_context0.n) {
          case 0:
            _context0.n = 1;
            return hydrateChatCache('project-chat', projId, chatId);
          case 1:
            setView({
              type: 'project-chat',
              projId: projId,
              chatId: chatId
            });
            setCompErr('');
          case 2:
            return _context0.a(2);
        }
      }, _callee0);
    }));
    return function openProjChat(_x1, _x10) {
      return _ref1.apply(this, arguments);
    };
  }();
  var openGlobChat = /*#__PURE__*/function () {
    var _ref10 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee1(chatId) {
      return _regenerator().w(function (_context1) {
        while (1) switch (_context1.n) {
          case 0:
            _context1.n = 1;
            return hydrateChatCache('global-chat', null, chatId);
          case 1:
            setView({
              type: 'global-chat',
              chatId: chatId
            });
            setCompErr('');
          case 2:
            return _context1.a(2);
        }
      }, _callee1);
    }));
    return function openGlobChat(_x11) {
      return _ref10.apply(this, arguments);
    };
  }();
  var newProjChat = /*#__PURE__*/function () {
    var _ref11 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee10(projId) {
      var res, chat;
      return _regenerator().w(function (_context10) {
        while (1) switch (_context10.n) {
          case 0:
            _context10.n = 1;
            return apiPost("/projects/".concat(projId, "/chats"), {
              user_id: USER_ID
            });
          case 1:
            res = _context10.v;
            if (res.ok) {
              _context10.n = 2;
              break;
            }
            return _context10.a(2);
          case 2:
            _context10.n = 3;
            return res.json();
          case 3:
            chat = _context10.v;
            setChatCache(function (prev) {
              return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, chat.chat_id, {
                messages: [],
                title: 'New chat'
              }));
            });
            setOpenProject(function (prev) {
              return prev ? _objectSpread(_objectSpread({}, prev), {}, {
                chats: [_objectSpread(_objectSpread({}, chat), {}, {
                  messages: []
                })].concat(_toConsumableArray(prev.chats || []))
              }) : prev;
            });
            setView({
              type: 'project-chat',
              projId: projId,
              chatId: chat.chat_id
            });
            setCompErr('');
          case 4:
            return _context10.a(2);
        }
      }, _callee10);
    }));
    return function newProjChat(_x12) {
      return _ref11.apply(this, arguments);
    };
  }();
  var deleteProjChat = /*#__PURE__*/function () {
    var _ref12 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee11(projId, chatId) {
      return _regenerator().w(function (_context11) {
        while (1) switch (_context11.n) {
          case 0:
            _context11.n = 1;
            return apiDel("/projects/".concat(projId, "/chats/").concat(chatId, "?user_id=").concat(USER_ID));
          case 1:
            setChatCache(function (prev) {
              var n = _objectSpread({}, prev);
              delete n[chatId];
              return n;
            });
            if (view.chatId === chatId) setView({
              type: 'project-chat',
              projId: projId,
              chatId: null
            });
            setOpenProject(function (prev) {
              return prev ? _objectSpread(_objectSpread({}, prev), {}, {
                chats: (prev.chats || []).filter(function (c) {
                  return c.chat_id !== chatId;
                })
              }) : prev;
            });
          case 2:
            return _context11.a(2);
        }
      }, _callee11);
    }));
    return function deleteProjChat(_x13, _x14) {
      return _ref12.apply(this, arguments);
    };
  }();
  var newGlobChat = /*#__PURE__*/function () {
    var _ref13 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee12() {
      var res, chat;
      return _regenerator().w(function (_context12) {
        while (1) switch (_context12.n) {
          case 0:
            _context12.n = 1;
            return apiPost('/global-chats', {
              user_id: USER_ID
            });
          case 1:
            res = _context12.v;
            if (res.ok) {
              _context12.n = 2;
              break;
            }
            return _context12.a(2);
          case 2:
            _context12.n = 3;
            return res.json();
          case 3:
            chat = _context12.v;
            setChatCache(function (prev) {
              return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, chat.chat_id, {
                messages: [],
                title: 'New chat'
              }));
            });
            setGlobalChats(function (prev) {
              return [chat].concat(_toConsumableArray(prev));
            });
            setView({
              type: 'global-chat',
              chatId: chat.chat_id
            });
            setCompErr('');
          case 4:
            return _context12.a(2);
        }
      }, _callee12);
    }));
    return function newGlobChat() {
      return _ref13.apply(this, arguments);
    };
  }();
  var deleteGlobChat = /*#__PURE__*/function () {
    var _ref14 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee13(chatId) {
      return _regenerator().w(function (_context13) {
        while (1) switch (_context13.n) {
          case 0:
            _context13.n = 1;
            return apiDel("/global-chats/".concat(chatId, "?user_id=").concat(USER_ID));
          case 1:
            setChatCache(function (prev) {
              var n = _objectSpread({}, prev);
              delete n[chatId];
              return n;
            });
            if (view.chatId === chatId) setView({
              type: 'global-chat',
              chatId: null
            });
            setGlobalChats(function (prev) {
              return prev.filter(function (c) {
                return c.chat_id !== chatId;
              });
            });
          case 2:
            return _context13.a(2);
        }
      }, _callee13);
    }));
    return function deleteGlobChat(_x15) {
      return _ref14.apply(this, arguments);
    };
  }();

  // ─── streaming (mutates cache in-place, never touches view) ───────────────────
  var patchLast = function patchLast(chatId, fn) {
    return setChatCache(function (prev) {
      var c = prev[chatId];
      if (!c) return prev;
      var msgs = _toConsumableArray(c.messages);
      msgs[msgs.length - 1] = fn(msgs[msgs.length - 1]);
      return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, chatId, _objectSpread(_objectSpread({}, c), {}, {
        messages: msgs
      })));
    });
  };
  var optimisticAppend = function optimisticAppend(chatId, userMsg) {
    return setChatCache(function (prev) {
      var c = prev[chatId] || {
        messages: [],
        title: userMsg.slice(0, 60)
      };
      return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, chatId, _objectSpread(_objectSpread({}, c), {}, {
        messages: [].concat(_toConsumableArray(c.messages), [{
          role: 'user',
          content: userMsg
        }, {
          role: 'assistant',
          content: '',
          isStreaming: true
        }])
      })));
    });
  };

  // ─── send ──────────────────────────────────────────────────────────────────────
  var sendMessage = /*#__PURE__*/function () {
    var _ref15 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee14() {
      var _abortRef$current2;
      var msg, ctrl, projId, chatId, _res, chat, res, _chatId, _res2, _chat, _res3, _t3;
      return _regenerator().w(function (_context14) {
        while (1) switch (_context14.p = _context14.n) {
          case 0:
            msg = input.trim();
            if (!(!msg || sending)) {
              _context14.n = 1;
              break;
            }
            return _context14.a(2);
          case 1:
            setSending(true);
            setCompErr('');
            setInput('');
            (_abortRef$current2 = abortRef.current) === null || _abortRef$current2 === void 0 || _abortRef$current2.abort();
            ctrl = new AbortController();
            abortRef.current = ctrl;
            _context14.p = 2;
            if (!(view.type === 'project-chat')) {
              _context14.n = 10;
              break;
            }
            projId = view.projId, chatId = view.chatId; // create chat lazily if needed
            if (chatId) {
              _context14.n = 6;
              break;
            }
            _context14.n = 3;
            return apiPost("/projects/".concat(projId, "/chats"), {
              user_id: USER_ID
            });
          case 3:
            _res = _context14.v;
            if (_res.ok) {
              _context14.n = 4;
              break;
            }
            throw new Error('Failed to create chat');
          case 4:
            _context14.n = 5;
            return _res.json();
          case 5:
            chat = _context14.v;
            chatId = chat.chat_id;
            setChatCache(function (prev) {
              return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, chatId, {
                messages: [],
                title: msg.slice(0, 60)
              }));
            });
            setView(function (v) {
              return _objectSpread(_objectSpread({}, v), {}, {
                chatId: chatId
              });
            });
          case 6:
            optimisticAppend(chatId, msg);
            _context14.n = 7;
            return fetch("".concat(API, "/projects/").concat(projId, "/chats/").concat(chatId, "/message/stream"), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                user_id: USER_ID,
                message: msg
              }),
              signal: ctrl.signal
            });
          case 7:
            res = _context14.v;
            if (!(!res.ok || !res.body)) {
              _context14.n = 8;
              break;
            }
            throw new Error('Stream failed');
          case 8:
            _context14.n = 9;
            return parseSSE(res, {
              onToken: function onToken(_ref16) {
                var token = _ref16.token;
                return patchLast(chatId, function (m) {
                  return _objectSpread(_objectSpread({}, m), {}, {
                    content: (m.content || '') + (token || '')
                  });
                });
              },
              onDone: function onDone() {
                patchLast(chatId, function (m) {
                  return _objectSpread(_objectSpread({}, m), {}, {
                    isStreaming: false
                  });
                });
                var title = msg.slice(0, 60);
                setChatCache(function (prev) {
                  return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, chatId, _objectSpread(_objectSpread({}, prev[chatId] || {}), {}, {
                    title: title
                  })));
                });
                setOpenProject(function (prev) {
                  return prev ? _objectSpread(_objectSpread({}, prev), {}, {
                    chats: (prev.chats || []).map(function (c) {
                      return c.chat_id === chatId ? _objectSpread(_objectSpread({}, c), {}, {
                        title: title
                      }) : c;
                    })
                  }) : prev;
                });
              },
              onError: function onError(_ref17) {
                var error = _ref17.error;
                return setCompErr(error || 'Error');
              }
            }, ctrl.signal);
          case 9:
            _context14.n = 17;
            break;
          case 10:
            if (!(view.type === 'global-chat')) {
              _context14.n = 17;
              break;
            }
            _chatId = view.chatId;
            if (_chatId) {
              _context14.n = 14;
              break;
            }
            _context14.n = 11;
            return apiPost('/global-chats', {
              user_id: USER_ID
            });
          case 11:
            _res2 = _context14.v;
            if (_res2.ok) {
              _context14.n = 12;
              break;
            }
            throw new Error('Failed to create chat');
          case 12:
            _context14.n = 13;
            return _res2.json();
          case 13:
            _chat = _context14.v;
            _chatId = _chat.chat_id;
            setChatCache(function (prev) {
              return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, _chatId, {
                messages: [],
                title: msg.slice(0, 60)
              }));
            });
            setGlobalChats(function (prev) {
              return [_chat].concat(_toConsumableArray(prev));
            });
            setView(function (v) {
              return _objectSpread(_objectSpread({}, v), {}, {
                chatId: _chatId
              });
            });
          case 14:
            optimisticAppend(_chatId, msg);
            _context14.n = 15;
            return fetch("".concat(API, "/global-chats/").concat(_chatId, "/message/stream"), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                user_id: USER_ID,
                message: msg,
                selected_studies: ctxStudies
              }),
              signal: ctrl.signal
            });
          case 15:
            _res3 = _context14.v;
            if (!(!_res3.ok || !_res3.body)) {
              _context14.n = 16;
              break;
            }
            throw new Error('Stream failed');
          case 16:
            _context14.n = 17;
            return parseSSE(_res3, {
              onToken: function onToken(_ref18) {
                var token = _ref18.token;
                return patchLast(_chatId, function (m) {
                  return _objectSpread(_objectSpread({}, m), {}, {
                    content: (m.content || '') + (token || '')
                  });
                });
              },
              onDone: function onDone() {
                patchLast(_chatId, function (m) {
                  return _objectSpread(_objectSpread({}, m), {}, {
                    isStreaming: false
                  });
                });
                var title = msg.slice(0, 60);
                setChatCache(function (prev) {
                  return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, _chatId, _objectSpread(_objectSpread({}, prev[_chatId] || {}), {}, {
                    title: title
                  })));
                });
                setGlobalChats(function (prev) {
                  return prev.map(function (c) {
                    return c.chat_id === _chatId ? _objectSpread(_objectSpread({}, c), {}, {
                      title: title
                    }) : c;
                  });
                });
              },
              onError: function onError(_ref19) {
                var error = _ref19.error;
                return setCompErr(error || 'Error');
              }
            }, ctrl.signal);
          case 17:
            _context14.n = 19;
            break;
          case 18:
            _context14.p = 18;
            _t3 = _context14.v;
            if (_t3.name !== 'AbortError') setCompErr(_t3.message || 'Failed to send');
          case 19:
            _context14.p = 19;
            setSending(false);
            return _context14.f(19);
          case 20:
            return _context14.a(2);
        }
      }, _callee14, null, [[2, 18, 19, 20]]);
    }));
    return function sendMessage() {
      return _ref15.apply(this, arguments);
    };
  }();

  // ─── open study modal with lazy detail fetch (abortable) ───────────────────
  var openStudyModal = /*#__PURE__*/function () {
    var _ref20 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee15(study) {
      var _modalAbortRef$curren;
      var ctrl, res, d, _t4;
      return _regenerator().w(function (_context15) {
        while (1) switch (_context15.p = _context15.n) {
          case 0:
            (_modalAbortRef$curren = modalAbortRef.current) === null || _modalAbortRef$curren === void 0 || _modalAbortRef$curren.abort();
            ctrl = new AbortController();
            modalAbortRef.current = ctrl;
            setModalStudy(study);
            setModalDetail(null);
            setModalDetailLoading(true);
            setSamplePreview(null);
            _context15.p = 1;
            _context15.n = 2;
            return apiFetch("/studies/".concat(study.study_id, "/detail"), {
              signal: ctrl.signal
            });
          case 2:
            res = _context15.v;
            if (!(res.ok && !ctrl.signal.aborted)) {
              _context15.n = 4;
              break;
            }
            _context15.n = 3;
            return res.json();
          case 3:
            d = _context15.v;
            setModalDetail(d);
          case 4:
            _context15.n = 6;
            break;
          case 5:
            _context15.p = 5;
            _t4 = _context15.v;
          case 6:
            if (!ctrl.signal.aborted) setModalDetailLoading(false);
          case 7:
            return _context15.a(2);
        }
      }, _callee15, null, [[1, 5]]);
    }));
    return function openStudyModal(_x16) {
      return _ref20.apply(this, arguments);
    };
  }();
  var fetchSamplePreview = /*#__PURE__*/function () {
    var _ref21 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee16(studyId, sampleId) {
      var res, _t5, _t6;
      return _regenerator().w(function (_context16) {
        while (1) switch (_context16.p = _context16.n) {
          case 0:
            if (!((samplePreview === null || samplePreview === void 0 ? void 0 : samplePreview.sample_id) === sampleId)) {
              _context16.n = 1;
              break;
            }
            setSamplePreview(null);
            return _context16.a(2);
          case 1:
            setSamplePreviewLoading(true);
            _context16.p = 2;
            _context16.n = 3;
            return apiFetch("/studies/".concat(studyId, "/samples/").concat(encodeURIComponent(sampleId)));
          case 3:
            res = _context16.v;
            if (!res.ok) {
              _context16.n = 5;
              break;
            }
            _t5 = setSamplePreview;
            _context16.n = 4;
            return res.json();
          case 4:
            _t5(_context16.v);
          case 5:
            _context16.n = 7;
            break;
          case 6:
            _context16.p = 6;
            _t6 = _context16.v;
          case 7:
            setSamplePreviewLoading(false);
          case 8:
            return _context16.a(2);
        }
      }, _callee16, null, [[2, 6]]);
    }));
    return function fetchSamplePreview(_x17, _x18) {
      return _ref21.apply(this, arguments);
    };
  }();
  var closeModal = function closeModal() {
    var _modalAbortRef$curren2;
    (_modalAbortRef$curren2 = modalAbortRef.current) === null || _modalAbortRef$curren2 === void 0 || _modalAbortRef$curren2.abort();
    setModalStudy(null);
    setModalDetail(null);
    setSamplePreview(null);
  };

  // ─── enrich all project studies from Qiita ──────────────────────────────────
  var enrichAllStudies = /*#__PURE__*/function () {
    var _ref22 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee17(projId) {
      var res, d;
      return _regenerator().w(function (_context17) {
        while (1) switch (_context17.n) {
          case 0:
            _context17.n = 1;
            return apiPost("/projects/".concat(projId, "/studies/enrich-all"), {
              user_id: USER_ID
            });
          case 1:
            res = _context17.v;
            if (!res.ok) {
              _context17.n = 3;
              break;
            }
            _context17.n = 2;
            return res.json();
          case 2:
            d = _context17.v;
            if (d.project) setOpenProject(d.project);
          case 3:
            return _context17.a(2);
        }
      }, _callee17);
    }));
    return function enrichAllStudies(_x19) {
      return _ref22.apply(this, arguments);
    };
  }();

  // ─── search ───────────────────────────────────────────────────────────────────
  var doSearch = /*#__PURE__*/function () {
    var _ref23 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee18(override) {
      var q, res, d;
      return _regenerator().w(function (_context18) {
        while (1) switch (_context18.n) {
          case 0:
            q = (override !== null && override !== void 0 ? override : query).trim();
            if (q) {
              _context18.n = 1;
              break;
            }
            return _context18.a(2);
          case 1:
            if (override) setQuery(override);
            setSearching(true);
            setSearched(false);
            _context18.n = 2;
            return apiPost('/search', {
              query: q
            });
          case 2:
            res = _context18.v;
            if (!res.ok) {
              _context18.n = 4;
              break;
            }
            _context18.n = 3;
            return res.json();
          case 3:
            d = _context18.v;
            setResults(d.results || []);
            setSqlQuery(d.sql_query || null);
            _context18.n = 5;
            break;
          case 4:
            setResults([]);
          case 5:
            setSearched(true);
            setSearching(false);
          case 6:
            return _context18.a(2);
        }
      }, _callee18);
    }));
    return function doSearch(_x20) {
      return _ref23.apply(this, arguments);
    };
  }();

  // ─── derived ──────────────────────────────────────────────────────────────────
  var projStudyIds = useMemo(function () {
    return ((openProject === null || openProject === void 0 ? void 0 : openProject.studies) || []).map(function (s) {
      return s.study_id;
    });
  }, [openProject]);
  var ctxStudyIds = useMemo(function () {
    return ctxStudies.map(function (s) {
      return s.study_id;
    });
  }, [ctxStudies]);
  var displayStudies = searched ? results : firstStudies;
  var isChat = view.type === 'project-chat' || view.type === 'global-chat';
  var canSend = isChat && input.trim().length > 0 && !sending;
  var topTitle = useMemo(function () {
    var _chatCache$view$chatI3;
    if (view.type === 'project-chat') {
      var _chatCache$view$chatI2;
      var proj = projects.find(function (p) {
        return p.project_id === view.projId;
      });
      return ((_chatCache$view$chatI2 = chatCache[view.chatId]) === null || _chatCache$view$chatI2 === void 0 ? void 0 : _chatCache$view$chatI2.title) || (proj === null || proj === void 0 ? void 0 : proj.name) || 'Project Chat';
    }
    if (view.type === 'global-chat') return ((_chatCache$view$chatI3 = chatCache[view.chatId]) === null || _chatCache$view$chatI3 === void 0 ? void 0 : _chatCache$view$chatI3.title) || 'Global Chat';
    return 'Browse Studies';
  }, [view, chatCache, projects]);

  // ─── render ───────────────────────────────────────────────────────────────────
  return /*#__PURE__*/React.createElement("div", {
    className: "app"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "sidebar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sidebar-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "app-logo"
  }, "Qiita", /*#__PURE__*/React.createElement("span", null, "Explorer"))), /*#__PURE__*/React.createElement("div", {
    className: "sidebar-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sb-label"
  }, "Projects"), projLoading && /*#__PURE__*/React.createElement("div", {
    className: "sb-loading"
  }, "Loading\u2026"), projects.map(function (p) {
    return /*#__PURE__*/React.createElement("div", {
      key: p.project_id
    }, /*#__PURE__*/React.createElement("div", {
      className: "folder-row ".concat(openProjId === p.project_id ? 'open' : '', " ").concat(view.projId === p.project_id ? 'viewing' : ''),
      onClick: function onClick() {
        if (openProjId === p.project_id) setOpenProjId(null);else {
          setOpenProjId(p.project_id);
          setProjInnerTab('chats');
        }
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "folder-caret"
    }, openProjId === p.project_id ? '▾' : '▸'), /*#__PURE__*/React.createElement("span", {
      className: "folder-icon-svg"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
    }))), /*#__PURE__*/React.createElement("span", {
      className: "folder-name"
    }, p.name), /*#__PURE__*/React.createElement("button", {
      className: "folder-del",
      title: "Delete",
      onClick: function onClick(e) {
        e.stopPropagation();
        deleteProject(p.project_id);
      }
    }, "\xD7")), openProjId === p.project_id && /*#__PURE__*/React.createElement("div", {
      className: "folder-expanded"
    }, /*#__PURE__*/React.createElement("button", {
      className: "folder-new-chat-btn",
      onClick: function onClick() {
        return newProjChat(p.project_id);
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "fnc-plus"
    }, "+"), /*#__PURE__*/React.createElement("span", {
      className: "fnc-text"
    }, "New chat in ", p.name)), /*#__PURE__*/React.createElement("div", {
      className: "inner-tabs"
    }, /*#__PURE__*/React.createElement("button", {
      className: "inner-tab ".concat(projInnerTab === 'chats' ? 'active' : ''),
      onClick: function onClick() {
        return setProjInnerTab('chats');
      }
    }, "Chats"), /*#__PURE__*/React.createElement("button", {
      className: "inner-tab ".concat(projInnerTab === 'sources' ? 'active' : ''),
      onClick: function onClick() {
        return setProjInnerTab('sources');
      }
    }, "Sources")), projInnerTab === 'chats' && ((openProject === null || openProject === void 0 ? void 0 : openProject.chats) || []).length === 0 && /*#__PURE__*/React.createElement("div", {
      className: "folder-empty"
    }, "No chats yet."), projInnerTab === 'chats' && ((openProject === null || openProject === void 0 ? void 0 : openProject.chats) || []).map(function (c) {
      var _chatCache$c$chat_id;
      return /*#__PURE__*/React.createElement("div", {
        key: c.chat_id,
        className: "chat-row ".concat(view.chatId === c.chat_id ? 'active' : ''),
        onClick: function onClick() {
          return openProjChat(p.project_id, c.chat_id);
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "cr-content"
      }, /*#__PURE__*/React.createElement("div", {
        className: "cr-title"
      }, ((_chatCache$c$chat_id = chatCache[c.chat_id]) === null || _chatCache$c$chat_id === void 0 ? void 0 : _chatCache$c$chat_id.title) || c.title || 'New chat'), c.updated_at && /*#__PURE__*/React.createElement("div", {
        className: "cr-date"
      }, new Date(c.updated_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      }))), /*#__PURE__*/React.createElement("button", {
        className: "cr-del",
        onClick: function onClick(e) {
          e.stopPropagation();
          deleteProjChat(p.project_id, c.chat_id);
        }
      }, "\xD7"));
    }), projInnerTab === 'sources' && ((openProject === null || openProject === void 0 ? void 0 : openProject.studies) || []).length > 0 && /*#__PURE__*/React.createElement("div", {
      className: "sources-tab-header"
    }, /*#__PURE__*/React.createElement("button", {
      className: "folder-refresh-btn",
      title: "Refresh sample/prep data from Qiita",
      onClick: function onClick(e) {
        e.stopPropagation();
        enrichAllStudies(p.project_id);
      }
    }, "\u21BB Refresh Data")), projInnerTab === 'sources' && ((openProject === null || openProject === void 0 ? void 0 : openProject.studies) || []).length === 0 && /*#__PURE__*/React.createElement("div", {
      className: "folder-empty"
    }, "No studies yet. Use Browse to add some."), projInnerTab === 'sources' && ((openProject === null || openProject === void 0 ? void 0 : openProject.studies) || []).map(function (s) {
      return /*#__PURE__*/React.createElement("div", {
        key: s.study_id,
        className: "chat-row",
        onClick: function onClick() {
          return openStudyModal(s);
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "cr-content"
      }, /*#__PURE__*/React.createElement("div", {
        className: "cr-title"
      }, s.study_title || 'Untitled'), /*#__PURE__*/React.createElement("div", {
        className: "cr-date"
      }, "ID ", s.study_id)), /*#__PURE__*/React.createElement("button", {
        className: "cr-del",
        onClick: function onClick(e) {
          e.stopPropagation();
          removeStudy(s.study_id);
        }
      }, "\xD7"));
    })));
  }), !showNewProj ? /*#__PURE__*/React.createElement("button", {
    className: "new-proj-btn",
    onClick: function onClick() {
      return setShowNewProj(true);
    }
  }, "+ New Project") : /*#__PURE__*/React.createElement("div", {
    className: "new-proj-form"
  }, /*#__PURE__*/React.createElement("input", {
    className: "new-proj-input",
    placeholder: "Project name\u2026",
    value: newProjName,
    onChange: function onChange(e) {
      return setNewProjName(e.target.value);
    },
    onKeyDown: function onKeyDown(e) {
      if (e.key === 'Enter') createProject();
      if (e.key === 'Escape') {
        setShowNewProj(false);
        setNewProjName('');
      }
    },
    autoFocus: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "new-proj-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "npb-create",
    onClick: createProject
  }, "Create"), /*#__PURE__*/React.createElement("button", {
    className: "npb-cancel",
    onClick: function onClick() {
      setShowNewProj(false);
      setNewProjName('');
    }
  }, "Cancel"))), /*#__PURE__*/React.createElement("div", {
    className: "sb-label",
    style: {
      marginTop: 24
    }
  }, "Global Chats"), /*#__PURE__*/React.createElement("button", {
    className: "new-proj-btn",
    onClick: newGlobChat
  }, "+ New Global Chat"), globalChats.map(function (c) {
    var _chatCache$c$chat_id2;
    return /*#__PURE__*/React.createElement("div", {
      key: c.chat_id,
      className: "chat-row flat ".concat(view.type === 'global-chat' && view.chatId === c.chat_id ? 'active' : ''),
      onClick: function onClick() {
        return openGlobChat(c.chat_id);
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "cr-content"
    }, /*#__PURE__*/React.createElement("div", {
      className: "cr-title"
    }, ((_chatCache$c$chat_id2 = chatCache[c.chat_id]) === null || _chatCache$c$chat_id2 === void 0 ? void 0 : _chatCache$c$chat_id2.title) || c.title || 'New chat'), c.updated_at && /*#__PURE__*/React.createElement("div", {
      className: "cr-date"
    }, new Date(c.updated_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    }))), /*#__PURE__*/React.createElement("button", {
      className: "cr-del",
      onClick: function onClick(e) {
        e.stopPropagation();
        deleteGlobChat(c.chat_id);
      }
    }, "\xD7"));
  })), /*#__PURE__*/React.createElement("div", {
    className: "sidebar-footer"
  }, /*#__PURE__*/React.createElement("button", {
    className: "browse-btn ".concat(view.type === 'browse' ? 'active' : ''),
    onClick: function onClick() {
      return setView({
        type: 'browse'
      });
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    style: {
      marginRight: 6
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "21",
    y1: "21",
    x2: "16.65",
    y2: "16.65"
  })), "Browse Studies"))), /*#__PURE__*/React.createElement("div", {
    className: "main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "topbar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "topbar-title"
  }, topTitle), view.type === 'project-chat' && (openProject === null || openProject === void 0 || (_openProject$studies = openProject.studies) === null || _openProject$studies === void 0 ? void 0 : _openProject$studies.length) > 0 && /*#__PURE__*/React.createElement("span", {
    className: "topbar-badge"
  }, openProject.studies.length, " sources")), /*#__PURE__*/React.createElement("div", {
    className: "content"
  }, view.type === 'browse' && /*#__PURE__*/React.createElement("div", {
    className: "browse-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "browse-search-row"
  }, /*#__PURE__*/React.createElement("input", {
    className: "browse-input",
    placeholder: "Search by keyword, author, or topic\u2026",
    value: query,
    onChange: function onChange(e) {
      return setQuery(e.target.value);
    },
    onKeyDown: function onKeyDown(e) {
      return e.key === 'Enter' && doSearch();
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn-search",
    onClick: function onClick() {
      return doSearch();
    },
    disabled: searching || !query.trim()
  }, searching ? '…' : 'Search'), searched && /*#__PURE__*/React.createElement("button", {
    className: "btn-clear",
    onClick: function onClick() {
      setQuery('');
      setResults([]);
      setSearched(false);
      setSqlQuery(null);
    }
  }, "Clear")), /*#__PURE__*/React.createElement("div", {
    className: "browse-chips"
  }, ['soil microbiome', 'gut bacteria', 'ocean samples', 'Rob Knight', 'UC San Diego', '16S rRNA'].map(function (q) {
    return /*#__PURE__*/React.createElement("button", {
      key: q,
      className: "browse-chip",
      onClick: function onClick() {
        return doSearch(q);
      }
    }, q);
  })), !openProjId && ctxStudies.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "ctx-bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ctx-label"
  }, "Chat context"), ctxStudies.map(function (s) {
    return /*#__PURE__*/React.createElement("button", {
      key: s.study_id,
      className: "ctx-chip",
      onClick: function onClick() {
        return setCtxStudies(function (prev) {
          return prev.filter(function (x) {
            return x.study_id !== s.study_id;
          });
        });
      }
    }, (s.study_title || 'Untitled').slice(0, 32), " \xD7");
  })), sqlQuery && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("label", {
    className: "sql-toggle"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: showSql,
    onChange: function onChange(e) {
      return setShowSql(e.target.checked);
    }
  }), "Show generated SQL"), showSql && /*#__PURE__*/React.createElement("div", {
    className: "sql-block"
  }, "WHERE ", sqlQuery.where_clause)), searching && /*#__PURE__*/React.createElement("div", {
    className: "state-loading"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spinner"
  }), /*#__PURE__*/React.createElement("br", null), "Searching\u2026"), !searching && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "browse-count"
  }, searched ? "".concat(results.length, " results") : 'First 20 studies'), searched && results.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "state-empty"
  }, "No studies matched your search."), /*#__PURE__*/React.createElement("div", {
    className: "studies-grid"
  }, displayStudies.map(function (study) {
    var inProj = projStudyIds.includes(study.study_id);
    var inCtx = ctxStudyIds.includes(study.study_id);
    var dataTypeList = (study.data_types || '').split(',').map(function (t) {
      return t.trim();
    }).filter(Boolean);
    var metaParts = [study.num_samples != null ? "".concat(study.num_samples, " samples") : null, study.num_preps != null ? "".concat(study.num_preps, " preps") : null].filter(Boolean);
    return /*#__PURE__*/React.createElement("div", {
      key: study.study_id,
      className: "study-card",
      onClick: function onClick() {
        return openStudyModal(study);
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "study-card-top"
    }, /*#__PURE__*/React.createElement("span", {
      className: "study-id-badge"
    }, "ID ", study.study_id), /*#__PURE__*/React.createElement("div", {
      className: "study-card-actions",
      onClick: function onClick(e) {
        return e.stopPropagation();
      }
    }, openProjId ? /*#__PURE__*/React.createElement("button", {
      className: "btn-card-add",
      disabled: inProj,
      onClick: function onClick() {
        return addStudyToProject(study);
      }
    }, inProj ? '✓ Saved' : '+ Add to Project') : /*#__PURE__*/React.createElement("button", {
      className: "btn-card-ctx ".concat(inCtx ? 'on' : ''),
      onClick: function onClick() {
        return setCtxStudies(function (prev) {
          return inCtx ? prev.filter(function (s) {
            return s.study_id !== study.study_id;
          }) : [].concat(_toConsumableArray(prev), [study]);
        });
      }
    }, inCtx ? '✓ Context' : '+ Context'))), /*#__PURE__*/React.createElement("div", {
      className: "study-card-title"
    }, study.study_title || 'Untitled study'), /*#__PURE__*/React.createElement("div", {
      className: "study-card-abstract"
    }, study.study_abstract || 'No abstract available.'), dataTypeList.length > 0 && /*#__PURE__*/React.createElement("div", {
      className: "study-card-types"
    }, dataTypeList.map(function (t) {
      return /*#__PURE__*/React.createElement("span", {
        key: t,
        className: "dtype-chip"
      }, t);
    })), metaParts.length > 0 && /*#__PURE__*/React.createElement("div", {
      className: "study-card-meta"
    }, metaParts.join(' · ')), (study.pi_name || study.pi_affiliation) && /*#__PURE__*/React.createElement("div", {
      className: "study-card-pi"
    }, [study.pi_name, study.pi_affiliation].filter(Boolean).join(' · ')));
  })))), isChat && /*#__PURE__*/React.createElement(React.Fragment, null, view.type === 'project-chat' && (openProject === null || openProject === void 0 || (_openProject$studies2 = openProject.studies) === null || _openProject$studies2 === void 0 ? void 0 : _openProject$studies2.length) > 0 && /*#__PURE__*/React.createElement("div", {
    className: "sources-bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sources-label"
  }, "Sources"), (openProject.studies || []).map(function (s) {
    return /*#__PURE__*/React.createElement("button", {
      key: s.study_id,
      className: "src-chip",
      onClick: function onClick() {
        return openStudyModal(s);
      }
    }, (s.study_title || 'Untitled').slice(0, 40));
  })), view.type === 'global-chat' && ctxStudies.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "sources-bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sources-label"
  }, "Context"), ctxStudies.map(function (s) {
    return /*#__PURE__*/React.createElement("button", {
      key: s.study_id,
      className: "src-chip removable",
      onClick: function onClick() {
        return setCtxStudies(function (prev) {
          return prev.filter(function (x) {
            return x.study_id !== s.study_id;
          });
        });
      }
    }, (s.study_title || 'Untitled').slice(0, 40), " \xD7");
  })), /*#__PURE__*/React.createElement("div", {
    className: "chat-messages"
  }, activeMsgs.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "chat-empty"
  }, /*#__PURE__*/React.createElement("div", {
    className: "chat-empty-title"
  }, view.type === 'project-chat' ? "Chat with ".concat(((_projects$find = projects.find(function (p) {
    return p.project_id === view.projId;
  })) === null || _projects$find === void 0 ? void 0 : _projects$find.name) || 'Project') : 'Global Chat'), /*#__PURE__*/React.createElement("p", {
    className: "chat-empty-sub"
  }, view.type === 'project-chat' ? "Ask anything about your ".concat((openProject === null || openProject === void 0 || (_openProject$studies3 = openProject.studies) === null || _openProject$studies3 === void 0 ? void 0 : _openProject$studies3.length) || 0, " saved studies.") : 'Add studies as context from Browse, then ask questions here.'), /*#__PURE__*/React.createElement("div", {
    className: "chat-empty-chips"
  }, ['What are the key themes?', 'Who are the PIs?', 'Summarize the abstracts', 'What sample types were used?'].map(function (q) {
    return /*#__PURE__*/React.createElement("button", {
      key: q,
      className: "chat-starter",
      onClick: function onClick() {
        var _taRef$current;
        setInput(q);
        (_taRef$current = taRef.current) === null || _taRef$current === void 0 || _taRef$current.focus();
      }
    }, q);
  }))) : activeMsgs.map(function (m, i) {
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "msg-row ".concat(m.role)
    }, m.role === 'assistant' ? /*#__PURE__*/React.createElement("div", {
      className: "msg-bubble".concat(m.isStreaming ? ' streaming' : ''),
      dangerouslySetInnerHTML: {
        __html: DOMPurify.sanitize(marked.parse(m.content || ''))
      }
    }) : /*#__PURE__*/React.createElement("div", {
      className: "msg-bubble"
    }, m.content));
  }), /*#__PURE__*/React.createElement("div", {
    ref: bottomRef
  }))), view.type === 'project-chat' && !view.chatId && !isChat && /*#__PURE__*/React.createElement("div", {
    className: "chat-empty",
    style: {
      paddingTop: 60
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "chat-empty-title"
  }, "Select a chat"), /*#__PURE__*/React.createElement("p", {
    className: "chat-empty-sub"
  }, "Pick a chat from the sidebar or start a new one."))), /*#__PURE__*/React.createElement("div", {
    className: "composer-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer ".concat(!isChat ? 'muted' : '')
  }, /*#__PURE__*/React.createElement("textarea", {
    ref: taRef,
    className: "composer-ta",
    rows: 1,
    placeholder: isChat ? 'Message…' : 'Open a chat to start messaging',
    value: input,
    onChange: function onChange(e) {
      return setInput(e.target.value);
    },
    onKeyDown: function onKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey && isChat) {
        e.preventDefault();
        sendMessage();
      }
    },
    disabled: !isChat || sending
  }), /*#__PURE__*/React.createElement("button", {
    className: "composer-send",
    onClick: sendMessage,
    disabled: !canSend
  }, "\u2191")), compErr && /*#__PURE__*/React.createElement("div", {
    className: "composer-error"
  }, compErr))), modalStudy && /*#__PURE__*/React.createElement("div", {
    className: "modal-overlay",
    onClick: closeModal
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-card",
    onClick: function onClick(e) {
      return e.stopPropagation();
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "modal-close",
    onClick: closeModal
  }, "\xD7"), /*#__PURE__*/React.createElement("div", {
    className: "modal-id"
  }, "Study ID ", modalStudy.study_id), /*#__PURE__*/React.createElement("div", {
    className: "modal-title"
  }, modalStudy.study_title || 'Untitled study'), (modalStudy.data_types || modalStudy.num_samples != null || modalStudy.num_preps != null) && /*#__PURE__*/React.createElement("div", {
    className: "modal-stats"
  }, (modalStudy.data_types || '').split(',').map(function (t) {
    return t.trim();
  }).filter(Boolean).map(function (t) {
    return /*#__PURE__*/React.createElement("span", {
      key: t,
      className: "dtype-chip"
    }, t);
  }), modalStudy.num_samples != null && /*#__PURE__*/React.createElement("span", {
    className: "modal-stat"
  }, modalStudy.num_samples, " samples"), modalStudy.num_preps != null && /*#__PURE__*/React.createElement("span", {
    className: "modal-stat"
  }, modalStudy.num_preps, " preps")), modalStudy.study_abstract && /*#__PURE__*/React.createElement("div", {
    className: "modal-section"
  }, /*#__PURE__*/React.createElement("h4", null, "Abstract"), /*#__PURE__*/React.createElement("p", null, modalStudy.study_abstract)), modalStudy.pi_name && /*#__PURE__*/React.createElement("div", {
    className: "modal-section"
  }, /*#__PURE__*/React.createElement("h4", null, "Principal Investigator"), /*#__PURE__*/React.createElement("p", null, modalStudy.pi_name, modalStudy.pi_affiliation ? " \u2014 ".concat(modalStudy.pi_affiliation) : '')), modalStudy.pi_email && /*#__PURE__*/React.createElement("div", {
    className: "modal-section"
  }, /*#__PURE__*/React.createElement("h4", null, "Contact"), /*#__PURE__*/React.createElement("p", null, modalStudy.pi_email)), /*#__PURE__*/React.createElement("div", {
    className: "modal-section"
  }, /*#__PURE__*/React.createElement("h4", null, "Prep Templates"), modalDetailLoading && /*#__PURE__*/React.createElement("div", {
    className: "modal-detail-loading"
  }, "Loading\u2026"), !modalDetailLoading && modalDetail && (modalDetail.preps || []).length === 0 && /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--text-3)',
      fontSize: '0.85rem'
    }
  }, "No prep templates found."), !modalDetailLoading && modalDetail && (modalDetail.preps || []).length > 0 && /*#__PURE__*/React.createElement("table", {
    className: "prep-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Prep ID"), /*#__PURE__*/React.createElement("th", null, "Data Type"), /*#__PURE__*/React.createElement("th", null, "Investigation"), /*#__PURE__*/React.createElement("th", null, "Platform"), /*#__PURE__*/React.createElement("th", null, "Target Gene"), /*#__PURE__*/React.createElement("th", null, "Status"))), /*#__PURE__*/React.createElement("tbody", null, modalDetail.preps.map(function (p) {
    return /*#__PURE__*/React.createElement("tr", {
      key: p.prep_template_id
    }, /*#__PURE__*/React.createElement("td", null, p.prep_template_id), /*#__PURE__*/React.createElement("td", null, p.data_type || '—'), /*#__PURE__*/React.createElement("td", null, p.investigation_type || '—'), /*#__PURE__*/React.createElement("td", null, p.platform || '—'), /*#__PURE__*/React.createElement("td", null, p.target_gene || '—'), /*#__PURE__*/React.createElement("td", null, p.preprocessing_status || '—'));
  })))), !modalDetailLoading && modalDetail && /*#__PURE__*/React.createElement("div", {
    className: "modal-section"
  }, /*#__PURE__*/React.createElement("h4", null, "Samples", modalDetail.total_samples != null ? " (".concat(modalDetail.total_samples, " total").concat(modalDetail.total_samples > 200 ? ', showing first 200' : '', ")") : ''), (modalDetail.samples || []).length === 0 ? /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--text-3)',
      fontSize: '0.85rem'
    }
  }, "No samples found.") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '1rem',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "samples-table-wrap",
    style: {
      flex: '0 0 auto',
      maxWidth: '55%'
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "prep-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Sample ID"), /*#__PURE__*/React.createElement("th", null, "Anonymized Name"), /*#__PURE__*/React.createElement("th", null, "Env Package"), /*#__PURE__*/React.createElement("th", null, "Collection Date"))), /*#__PURE__*/React.createElement("tbody", null, modalDetail.samples.map(function (s) {
    return /*#__PURE__*/React.createElement("tr", {
      key: s.sample_id,
      onClick: function onClick() {
        return fetchSamplePreview(modalStudy.study_id, s.sample_id);
      },
      style: {
        cursor: 'pointer',
        background: (samplePreview === null || samplePreview === void 0 ? void 0 : samplePreview.sample_id) === s.sample_id ? 'var(--accent-bg,#f0f4ff)' : ''
      }
    }, /*#__PURE__*/React.createElement("td", null, s.sample_id), /*#__PURE__*/React.createElement("td", null, s.anonymized_name || '—'), /*#__PURE__*/React.createElement("td", null, s.env_package || '—'), /*#__PURE__*/React.createElement("td", null, s.collection_timestamp ? s.collection_timestamp.slice(0, 10) : '—'));
  })))), samplePreviewLoading && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: 'var(--text-3)',
      fontSize: '0.85rem',
      paddingTop: '0.5rem'
    }
  }, "Loading\u2026"), !samplePreviewLoading && samplePreview && /*#__PURE__*/React.createElement("div", {
    className: "sample-preview-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sample-preview-header"
  }, /*#__PURE__*/React.createElement("span", null, samplePreview.sample_id), /*#__PURE__*/React.createElement("button", {
    className: "sample-preview-close",
    onClick: function onClick() {
      return setSamplePreview(null);
    }
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "sample-preview-body"
  }, Object.entries(samplePreview.fields).filter(function (_ref24) {
    var _ref25 = _slicedToArray(_ref24, 2),
      v = _ref25[1];
    return v != null && v !== '';
  }).sort(function (_ref26, _ref27) {
    var _ref28 = _slicedToArray(_ref26, 1),
      a = _ref28[0];
    var _ref29 = _slicedToArray(_ref27, 1),
      b = _ref29[0];
    return a.localeCompare(b);
  }).map(function (_ref30) {
    var _ref31 = _slicedToArray(_ref30, 2),
      k = _ref31[0],
      v = _ref31[1];
    return /*#__PURE__*/React.createElement("div", {
      key: k,
      className: "sample-preview-row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "sample-preview-key"
    }, k), /*#__PURE__*/React.createElement("span", {
      className: "sample-preview-val"
    }, String(v)));
  }))))), !modalDetailLoading && modalDetail && (modalDetail.artifacts || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "modal-section"
  }, /*#__PURE__*/React.createElement("h4", null, "Artifacts"), /*#__PURE__*/React.createElement("table", {
    className: "prep-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Artifact ID"), /*#__PURE__*/React.createElement("th", null, "Type"), /*#__PURE__*/React.createElement("th", null, "Data Type"), /*#__PURE__*/React.createElement("th", null, "File Path"))), /*#__PURE__*/React.createElement("tbody", null, modalDetail.artifacts.map(function (a) {
    return /*#__PURE__*/React.createElement("tr", {
      key: "".concat(a.prep_template_id, "-").concat(a.artifact_id)
    }, /*#__PURE__*/React.createElement("td", null, a.artifact_id), /*#__PURE__*/React.createElement("td", null, a.artifact_type || '—'), /*#__PURE__*/React.createElement("td", null, a.data_type || '—'), /*#__PURE__*/React.createElement("td", {
      className: "artifact-path-cell"
    }, /*#__PURE__*/React.createElement("span", {
      className: "artifact-path",
      title: a.full_path
    }, a.full_path ? a.full_path.split('/').slice(-2).join('/') : '—'), a.full_path && /*#__PURE__*/React.createElement("button", {
      className: "btn-copy-path",
      title: "Copy full path",
      onClick: function onClick() {
        var _navigator$clipboard;
        return (_navigator$clipboard = navigator.clipboard) === null || _navigator$clipboard === void 0 ? void 0 : _navigator$clipboard.writeText(a.full_path);
      }
    }, "\u2398")));
  })))))));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
