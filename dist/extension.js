"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/postgres-array/index.js
var require_postgres_array = __commonJS({
  "node_modules/postgres-array/index.js"(exports2) {
    "use strict";
    exports2.parse = function(source, transform) {
      return new ArrayParser(source, transform).parse();
    };
    var ArrayParser = class _ArrayParser {
      constructor(source, transform) {
        this.source = source;
        this.transform = transform || identity;
        this.position = 0;
        this.entries = [];
        this.recorded = [];
        this.dimension = 0;
      }
      isEof() {
        return this.position >= this.source.length;
      }
      nextCharacter() {
        var character = this.source[this.position++];
        if (character === "\\") {
          return {
            value: this.source[this.position++],
            escaped: true
          };
        }
        return {
          value: character,
          escaped: false
        };
      }
      record(character) {
        this.recorded.push(character);
      }
      newEntry(includeEmpty) {
        var entry;
        if (this.recorded.length > 0 || includeEmpty) {
          entry = this.recorded.join("");
          if (entry === "NULL" && !includeEmpty) {
            entry = null;
          }
          if (entry !== null) entry = this.transform(entry);
          this.entries.push(entry);
          this.recorded = [];
        }
      }
      consumeDimensions() {
        if (this.source[0] === "[") {
          while (!this.isEof()) {
            var char = this.nextCharacter();
            if (char.value === "=") break;
          }
        }
      }
      parse(nested) {
        var character, parser, quote;
        this.consumeDimensions();
        while (!this.isEof()) {
          character = this.nextCharacter();
          if (character.value === "{" && !quote) {
            this.dimension++;
            if (this.dimension > 1) {
              parser = new _ArrayParser(this.source.substr(this.position - 1), this.transform);
              this.entries.push(parser.parse(true));
              this.position += parser.position - 2;
            }
          } else if (character.value === "}" && !quote) {
            this.dimension--;
            if (!this.dimension) {
              this.newEntry();
              if (nested) return this.entries;
            }
          } else if (character.value === '"' && !character.escaped) {
            if (quote) this.newEntry(true);
            quote = !quote;
          } else if (character.value === "," && !quote) {
            this.newEntry();
          } else {
            this.record(character.value);
          }
        }
        if (this.dimension !== 0) {
          throw new Error("array dimension not balanced");
        }
        return this.entries;
      }
    };
    function identity(value) {
      return value;
    }
  }
});

// node_modules/pg-types/lib/arrayParser.js
var require_arrayParser = __commonJS({
  "node_modules/pg-types/lib/arrayParser.js"(exports2, module2) {
    var array = require_postgres_array();
    module2.exports = {
      create: function(source, transform) {
        return {
          parse: function() {
            return array.parse(source, transform);
          }
        };
      }
    };
  }
});

// node_modules/postgres-date/index.js
var require_postgres_date = __commonJS({
  "node_modules/postgres-date/index.js"(exports2, module2) {
    "use strict";
    var DATE_TIME = /(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?.*?( BC)?$/;
    var DATE = /^(\d{1,})-(\d{2})-(\d{2})( BC)?$/;
    var TIME_ZONE = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/;
    var INFINITY = /^-?infinity$/;
    module2.exports = function parseDate(isoDate) {
      if (INFINITY.test(isoDate)) {
        return Number(isoDate.replace("i", "I"));
      }
      var matches = DATE_TIME.exec(isoDate);
      if (!matches) {
        return getDate(isoDate) || null;
      }
      var isBC = !!matches[8];
      var year = parseInt(matches[1], 10);
      if (isBC) {
        year = bcYearToNegativeYear(year);
      }
      var month = parseInt(matches[2], 10) - 1;
      var day = matches[3];
      var hour = parseInt(matches[4], 10);
      var minute = parseInt(matches[5], 10);
      var second = parseInt(matches[6], 10);
      var ms = matches[7];
      ms = ms ? 1e3 * parseFloat(ms) : 0;
      var date;
      var offset = timeZoneOffset(isoDate);
      if (offset != null) {
        date = new Date(Date.UTC(year, month, day, hour, minute, second, ms));
        if (is0To99(year)) {
          date.setUTCFullYear(year);
        }
        if (offset !== 0) {
          date.setTime(date.getTime() - offset);
        }
      } else {
        date = new Date(year, month, day, hour, minute, second, ms);
        if (is0To99(year)) {
          date.setFullYear(year);
        }
      }
      return date;
    };
    function getDate(isoDate) {
      var matches = DATE.exec(isoDate);
      if (!matches) {
        return;
      }
      var year = parseInt(matches[1], 10);
      var isBC = !!matches[4];
      if (isBC) {
        year = bcYearToNegativeYear(year);
      }
      var month = parseInt(matches[2], 10) - 1;
      var day = matches[3];
      var date = new Date(year, month, day);
      if (is0To99(year)) {
        date.setFullYear(year);
      }
      return date;
    }
    function timeZoneOffset(isoDate) {
      if (isoDate.endsWith("+00")) {
        return 0;
      }
      var zone = TIME_ZONE.exec(isoDate.split(" ")[1]);
      if (!zone) return;
      var type = zone[1];
      if (type === "Z") {
        return 0;
      }
      var sign = type === "-" ? -1 : 1;
      var offset = parseInt(zone[2], 10) * 3600 + parseInt(zone[3] || 0, 10) * 60 + parseInt(zone[4] || 0, 10);
      return offset * sign * 1e3;
    }
    function bcYearToNegativeYear(year) {
      return -(year - 1);
    }
    function is0To99(num) {
      return num >= 0 && num < 100;
    }
  }
});

// node_modules/xtend/mutable.js
var require_mutable = __commonJS({
  "node_modules/xtend/mutable.js"(exports2, module2) {
    module2.exports = extend;
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function extend(target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        for (var key in source) {
          if (hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }
      return target;
    }
  }
});

// node_modules/postgres-interval/index.js
var require_postgres_interval = __commonJS({
  "node_modules/postgres-interval/index.js"(exports2, module2) {
    "use strict";
    var extend = require_mutable();
    module2.exports = PostgresInterval;
    function PostgresInterval(raw) {
      if (!(this instanceof PostgresInterval)) {
        return new PostgresInterval(raw);
      }
      extend(this, parse(raw));
    }
    var properties = ["seconds", "minutes", "hours", "days", "months", "years"];
    PostgresInterval.prototype.toPostgres = function() {
      var filtered = properties.filter(this.hasOwnProperty, this);
      if (this.milliseconds && filtered.indexOf("seconds") < 0) {
        filtered.push("seconds");
      }
      if (filtered.length === 0) return "0";
      return filtered.map(function(property) {
        var value = this[property] || 0;
        if (property === "seconds" && this.milliseconds) {
          value = (value + this.milliseconds / 1e3).toFixed(6).replace(/\.?0+$/, "");
        }
        return value + " " + property;
      }, this).join(" ");
    };
    var propertiesISOEquivalent = {
      years: "Y",
      months: "M",
      days: "D",
      hours: "H",
      minutes: "M",
      seconds: "S"
    };
    var dateProperties = ["years", "months", "days"];
    var timeProperties = ["hours", "minutes", "seconds"];
    PostgresInterval.prototype.toISOString = PostgresInterval.prototype.toISO = function() {
      var datePart = dateProperties.map(buildProperty, this).join("");
      var timePart = timeProperties.map(buildProperty, this).join("");
      return "P" + datePart + "T" + timePart;
      function buildProperty(property) {
        var value = this[property] || 0;
        if (property === "seconds" && this.milliseconds) {
          value = (value + this.milliseconds / 1e3).toFixed(6).replace(/0+$/, "");
        }
        return value + propertiesISOEquivalent[property];
      }
    };
    var NUMBER = "([+-]?\\d+)";
    var YEAR = NUMBER + "\\s+years?";
    var MONTH = NUMBER + "\\s+mons?";
    var DAY = NUMBER + "\\s+days?";
    var TIME = "([+-])?([\\d]*):(\\d\\d):(\\d\\d)\\.?(\\d{1,6})?";
    var INTERVAL = new RegExp([YEAR, MONTH, DAY, TIME].map(function(regexString) {
      return "(" + regexString + ")?";
    }).join("\\s*"));
    var positions = {
      years: 2,
      months: 4,
      days: 6,
      hours: 9,
      minutes: 10,
      seconds: 11,
      milliseconds: 12
    };
    var negatives = ["hours", "minutes", "seconds", "milliseconds"];
    function parseMilliseconds(fraction) {
      var microseconds = fraction + "000000".slice(fraction.length);
      return parseInt(microseconds, 10) / 1e3;
    }
    function parse(interval) {
      if (!interval) return {};
      var matches = INTERVAL.exec(interval);
      var isNegative = matches[8] === "-";
      return Object.keys(positions).reduce(function(parsed, property) {
        var position = positions[property];
        var value = matches[position];
        if (!value) return parsed;
        value = property === "milliseconds" ? parseMilliseconds(value) : parseInt(value, 10);
        if (!value) return parsed;
        if (isNegative && ~negatives.indexOf(property)) {
          value *= -1;
        }
        parsed[property] = value;
        return parsed;
      }, {});
    }
  }
});

// node_modules/postgres-bytea/index.js
var require_postgres_bytea = __commonJS({
  "node_modules/postgres-bytea/index.js"(exports2, module2) {
    "use strict";
    var bufferFrom = Buffer.from || Buffer;
    module2.exports = function parseBytea(input) {
      if (/^\\x/.test(input)) {
        return bufferFrom(input.substr(2), "hex");
      }
      var output = "";
      var i = 0;
      while (i < input.length) {
        if (input[i] !== "\\") {
          output += input[i];
          ++i;
        } else {
          if (/[0-7]{3}/.test(input.substr(i + 1, 3))) {
            output += String.fromCharCode(parseInt(input.substr(i + 1, 3), 8));
            i += 4;
          } else {
            var backslashes = 1;
            while (i + backslashes < input.length && input[i + backslashes] === "\\") {
              backslashes++;
            }
            for (var k = 0; k < Math.floor(backslashes / 2); ++k) {
              output += "\\";
            }
            i += Math.floor(backslashes / 2) * 2;
          }
        }
      }
      return bufferFrom(output, "binary");
    };
  }
});

// node_modules/pg-types/lib/textParsers.js
var require_textParsers = __commonJS({
  "node_modules/pg-types/lib/textParsers.js"(exports2, module2) {
    var array = require_postgres_array();
    var arrayParser = require_arrayParser();
    var parseDate = require_postgres_date();
    var parseInterval = require_postgres_interval();
    var parseByteA = require_postgres_bytea();
    function allowNull(fn) {
      return function nullAllowed(value) {
        if (value === null) return value;
        return fn(value);
      };
    }
    function parseBool(value) {
      if (value === null) return value;
      return value === "TRUE" || value === "t" || value === "true" || value === "y" || value === "yes" || value === "on" || value === "1";
    }
    function parseBoolArray(value) {
      if (!value) return null;
      return array.parse(value, parseBool);
    }
    function parseBaseTenInt(string) {
      return parseInt(string, 10);
    }
    function parseIntegerArray(value) {
      if (!value) return null;
      return array.parse(value, allowNull(parseBaseTenInt));
    }
    function parseBigIntegerArray(value) {
      if (!value) return null;
      return array.parse(value, allowNull(function(entry) {
        return parseBigInteger(entry).trim();
      }));
    }
    var parsePointArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parsePoint(entry);
        }
        return entry;
      });
      return p.parse();
    };
    var parseFloatArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseFloat(entry);
        }
        return entry;
      });
      return p.parse();
    };
    var parseStringArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value);
      return p.parse();
    };
    var parseDateArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseDate(entry);
        }
        return entry;
      });
      return p.parse();
    };
    var parseIntervalArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseInterval(entry);
        }
        return entry;
      });
      return p.parse();
    };
    var parseByteAArray = function(value) {
      if (!value) {
        return null;
      }
      return array.parse(value, allowNull(parseByteA));
    };
    var parseInteger = function(value) {
      return parseInt(value, 10);
    };
    var parseBigInteger = function(value) {
      var valStr = String(value);
      if (/^\d+$/.test(valStr)) {
        return valStr;
      }
      return value;
    };
    var parseJsonArray = function(value) {
      if (!value) {
        return null;
      }
      return array.parse(value, allowNull(JSON.parse));
    };
    var parsePoint = function(value) {
      if (value[0] !== "(") {
        return null;
      }
      value = value.substring(1, value.length - 1).split(",");
      return {
        x: parseFloat(value[0]),
        y: parseFloat(value[1])
      };
    };
    var parseCircle = function(value) {
      if (value[0] !== "<" && value[1] !== "(") {
        return null;
      }
      var point = "(";
      var radius = "";
      var pointParsed = false;
      for (var i = 2; i < value.length - 1; i++) {
        if (!pointParsed) {
          point += value[i];
        }
        if (value[i] === ")") {
          pointParsed = true;
          continue;
        } else if (!pointParsed) {
          continue;
        }
        if (value[i] === ",") {
          continue;
        }
        radius += value[i];
      }
      var result = parsePoint(point);
      result.radius = parseFloat(radius);
      return result;
    };
    var init = function(register) {
      register(20, parseBigInteger);
      register(21, parseInteger);
      register(23, parseInteger);
      register(26, parseInteger);
      register(700, parseFloat);
      register(701, parseFloat);
      register(16, parseBool);
      register(1082, parseDate);
      register(1114, parseDate);
      register(1184, parseDate);
      register(600, parsePoint);
      register(651, parseStringArray);
      register(718, parseCircle);
      register(1e3, parseBoolArray);
      register(1001, parseByteAArray);
      register(1005, parseIntegerArray);
      register(1007, parseIntegerArray);
      register(1028, parseIntegerArray);
      register(1016, parseBigIntegerArray);
      register(1017, parsePointArray);
      register(1021, parseFloatArray);
      register(1022, parseFloatArray);
      register(1231, parseFloatArray);
      register(1014, parseStringArray);
      register(1015, parseStringArray);
      register(1008, parseStringArray);
      register(1009, parseStringArray);
      register(1040, parseStringArray);
      register(1041, parseStringArray);
      register(1115, parseDateArray);
      register(1182, parseDateArray);
      register(1185, parseDateArray);
      register(1186, parseInterval);
      register(1187, parseIntervalArray);
      register(17, parseByteA);
      register(114, JSON.parse.bind(JSON));
      register(3802, JSON.parse.bind(JSON));
      register(199, parseJsonArray);
      register(3807, parseJsonArray);
      register(3907, parseStringArray);
      register(2951, parseStringArray);
      register(791, parseStringArray);
      register(1183, parseStringArray);
      register(1270, parseStringArray);
    };
    module2.exports = {
      init
    };
  }
});

// node_modules/pg-int8/index.js
var require_pg_int8 = __commonJS({
  "node_modules/pg-int8/index.js"(exports2, module2) {
    "use strict";
    var BASE = 1e6;
    function readInt8(buffer) {
      var high = buffer.readInt32BE(0);
      var low = buffer.readUInt32BE(4);
      var sign = "";
      if (high < 0) {
        high = ~high + (low === 0);
        low = ~low + 1 >>> 0;
        sign = "-";
      }
      var result = "";
      var carry;
      var t;
      var digits;
      var pad;
      var l;
      var i;
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign + digits + result;
        }
        pad = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad += "0";
        }
        result = pad + digits + result;
      }
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign + digits + result;
        }
        pad = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad += "0";
        }
        result = pad + digits + result;
      }
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign + digits + result;
        }
        pad = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad += "0";
        }
        result = pad + digits + result;
      }
      {
        carry = high % BASE;
        t = 4294967296 * carry + low;
        digits = "" + t % BASE;
        return sign + digits + result;
      }
    }
    module2.exports = readInt8;
  }
});

// node_modules/pg-types/lib/binaryParsers.js
var require_binaryParsers = __commonJS({
  "node_modules/pg-types/lib/binaryParsers.js"(exports2, module2) {
    var parseInt64 = require_pg_int8();
    var parseBits = function(data, bits, offset, invert, callback) {
      offset = offset || 0;
      invert = invert || false;
      callback = callback || function(lastValue, newValue, bits2) {
        return lastValue * Math.pow(2, bits2) + newValue;
      };
      var offsetBytes = offset >> 3;
      var inv = function(value) {
        if (invert) {
          return ~value & 255;
        }
        return value;
      };
      var mask = 255;
      var firstBits = 8 - offset % 8;
      if (bits < firstBits) {
        mask = 255 << 8 - bits & 255;
        firstBits = bits;
      }
      if (offset) {
        mask = mask >> offset % 8;
      }
      var result = 0;
      if (offset % 8 + bits >= 8) {
        result = callback(0, inv(data[offsetBytes]) & mask, firstBits);
      }
      var bytes = bits + offset >> 3;
      for (var i = offsetBytes + 1; i < bytes; i++) {
        result = callback(result, inv(data[i]), 8);
      }
      var lastBits = (bits + offset) % 8;
      if (lastBits > 0) {
        result = callback(result, inv(data[bytes]) >> 8 - lastBits, lastBits);
      }
      return result;
    };
    var parseFloatFromBits = function(data, precisionBits, exponentBits) {
      var bias = Math.pow(2, exponentBits - 1) - 1;
      var sign = parseBits(data, 1);
      var exponent = parseBits(data, exponentBits, 1);
      if (exponent === 0) {
        return 0;
      }
      var precisionBitsCounter = 1;
      var parsePrecisionBits = function(lastValue, newValue, bits) {
        if (lastValue === 0) {
          lastValue = 1;
        }
        for (var i = 1; i <= bits; i++) {
          precisionBitsCounter /= 2;
          if ((newValue & 1 << bits - i) > 0) {
            lastValue += precisionBitsCounter;
          }
        }
        return lastValue;
      };
      var mantissa = parseBits(data, precisionBits, exponentBits + 1, false, parsePrecisionBits);
      if (exponent == Math.pow(2, exponentBits + 1) - 1) {
        if (mantissa === 0) {
          return sign === 0 ? Infinity : -Infinity;
        }
        return NaN;
      }
      return (sign === 0 ? 1 : -1) * Math.pow(2, exponent - bias) * mantissa;
    };
    var parseInt16 = function(value) {
      if (parseBits(value, 1) == 1) {
        return -1 * (parseBits(value, 15, 1, true) + 1);
      }
      return parseBits(value, 15, 1);
    };
    var parseInt32 = function(value) {
      if (parseBits(value, 1) == 1) {
        return -1 * (parseBits(value, 31, 1, true) + 1);
      }
      return parseBits(value, 31, 1);
    };
    var parseFloat32 = function(value) {
      return parseFloatFromBits(value, 23, 8);
    };
    var parseFloat64 = function(value) {
      return parseFloatFromBits(value, 52, 11);
    };
    var parseNumeric = function(value) {
      var sign = parseBits(value, 16, 32);
      if (sign == 49152) {
        return NaN;
      }
      var weight = Math.pow(1e4, parseBits(value, 16, 16));
      var result = 0;
      var digits = [];
      var ndigits = parseBits(value, 16);
      for (var i = 0; i < ndigits; i++) {
        result += parseBits(value, 16, 64 + 16 * i) * weight;
        weight /= 1e4;
      }
      var scale = Math.pow(10, parseBits(value, 16, 48));
      return (sign === 0 ? 1 : -1) * Math.round(result * scale) / scale;
    };
    var parseDate = function(isUTC, value) {
      var sign = parseBits(value, 1);
      var rawValue = parseBits(value, 63, 1);
      var result = new Date((sign === 0 ? 1 : -1) * rawValue / 1e3 + 9466848e5);
      if (!isUTC) {
        result.setTime(result.getTime() + result.getTimezoneOffset() * 6e4);
      }
      result.usec = rawValue % 1e3;
      result.getMicroSeconds = function() {
        return this.usec;
      };
      result.setMicroSeconds = function(value2) {
        this.usec = value2;
      };
      result.getUTCMicroSeconds = function() {
        return this.usec;
      };
      return result;
    };
    var parseArray = function(value) {
      var dim = parseBits(value, 32);
      var flags = parseBits(value, 32, 32);
      var elementType = parseBits(value, 32, 64);
      var offset = 96;
      var dims = [];
      for (var i = 0; i < dim; i++) {
        dims[i] = parseBits(value, 32, offset);
        offset += 32;
        offset += 32;
      }
      var parseElement = function(elementType2) {
        var length = parseBits(value, 32, offset);
        offset += 32;
        if (length == 4294967295) {
          return null;
        }
        var result;
        if (elementType2 == 23 || elementType2 == 20) {
          result = parseBits(value, length * 8, offset);
          offset += length * 8;
          return result;
        } else if (elementType2 == 25) {
          result = value.toString(this.encoding, offset >> 3, (offset += length << 3) >> 3);
          return result;
        } else {
          console.log("ERROR: ElementType not implemented: " + elementType2);
        }
      };
      var parse = function(dimension, elementType2) {
        var array = [];
        var i2;
        if (dimension.length > 1) {
          var count = dimension.shift();
          for (i2 = 0; i2 < count; i2++) {
            array[i2] = parse(dimension, elementType2);
          }
          dimension.unshift(count);
        } else {
          for (i2 = 0; i2 < dimension[0]; i2++) {
            array[i2] = parseElement(elementType2);
          }
        }
        return array;
      };
      return parse(dims, elementType);
    };
    var parseText = function(value) {
      return value.toString("utf8");
    };
    var parseBool = function(value) {
      if (value === null) return null;
      return parseBits(value, 8) > 0;
    };
    var init = function(register) {
      register(20, parseInt64);
      register(21, parseInt16);
      register(23, parseInt32);
      register(26, parseInt32);
      register(1700, parseNumeric);
      register(700, parseFloat32);
      register(701, parseFloat64);
      register(16, parseBool);
      register(1114, parseDate.bind(null, false));
      register(1184, parseDate.bind(null, true));
      register(1e3, parseArray);
      register(1007, parseArray);
      register(1016, parseArray);
      register(1008, parseArray);
      register(1009, parseArray);
      register(25, parseText);
    };
    module2.exports = {
      init
    };
  }
});

// node_modules/pg-types/lib/builtins.js
var require_builtins = __commonJS({
  "node_modules/pg-types/lib/builtins.js"(exports2, module2) {
    module2.exports = {
      BOOL: 16,
      BYTEA: 17,
      CHAR: 18,
      INT8: 20,
      INT2: 21,
      INT4: 23,
      REGPROC: 24,
      TEXT: 25,
      OID: 26,
      TID: 27,
      XID: 28,
      CID: 29,
      JSON: 114,
      XML: 142,
      PG_NODE_TREE: 194,
      SMGR: 210,
      PATH: 602,
      POLYGON: 604,
      CIDR: 650,
      FLOAT4: 700,
      FLOAT8: 701,
      ABSTIME: 702,
      RELTIME: 703,
      TINTERVAL: 704,
      CIRCLE: 718,
      MACADDR8: 774,
      MONEY: 790,
      MACADDR: 829,
      INET: 869,
      ACLITEM: 1033,
      BPCHAR: 1042,
      VARCHAR: 1043,
      DATE: 1082,
      TIME: 1083,
      TIMESTAMP: 1114,
      TIMESTAMPTZ: 1184,
      INTERVAL: 1186,
      TIMETZ: 1266,
      BIT: 1560,
      VARBIT: 1562,
      NUMERIC: 1700,
      REFCURSOR: 1790,
      REGPROCEDURE: 2202,
      REGOPER: 2203,
      REGOPERATOR: 2204,
      REGCLASS: 2205,
      REGTYPE: 2206,
      UUID: 2950,
      TXID_SNAPSHOT: 2970,
      PG_LSN: 3220,
      PG_NDISTINCT: 3361,
      PG_DEPENDENCIES: 3402,
      TSVECTOR: 3614,
      TSQUERY: 3615,
      GTSVECTOR: 3642,
      REGCONFIG: 3734,
      REGDICTIONARY: 3769,
      JSONB: 3802,
      REGNAMESPACE: 4089,
      REGROLE: 4096
    };
  }
});

// node_modules/pg-types/index.js
var require_pg_types = __commonJS({
  "node_modules/pg-types/index.js"(exports2) {
    var textParsers = require_textParsers();
    var binaryParsers = require_binaryParsers();
    var arrayParser = require_arrayParser();
    var builtinTypes = require_builtins();
    exports2.getTypeParser = getTypeParser;
    exports2.setTypeParser = setTypeParser;
    exports2.arrayParser = arrayParser;
    exports2.builtins = builtinTypes;
    var typeParsers = {
      text: {},
      binary: {}
    };
    function noParse(val) {
      return String(val);
    }
    function getTypeParser(oid, format) {
      format = format || "text";
      if (!typeParsers[format]) {
        return noParse;
      }
      return typeParsers[format][oid] || noParse;
    }
    function setTypeParser(oid, format, parseFn) {
      if (typeof format == "function") {
        parseFn = format;
        format = "text";
      }
      typeParsers[format][oid] = parseFn;
    }
    textParsers.init(function(oid, converter) {
      typeParsers.text[oid] = converter;
    });
    binaryParsers.init(function(oid, converter) {
      typeParsers.binary[oid] = converter;
    });
  }
});

// node_modules/pg/lib/defaults.js
var require_defaults = __commonJS({
  "node_modules/pg/lib/defaults.js"(exports2, module2) {
    "use strict";
    var user;
    try {
      user = process.platform === "win32" ? process.env.USERNAME : process.env.USER;
    } catch {
    }
    module2.exports = {
      // database host. defaults to localhost
      host: "localhost",
      // database user's name
      user,
      // name of database to connect
      database: void 0,
      // database user's password
      password: null,
      // a Postgres connection string to be used instead of setting individual connection items
      // NOTE:  Setting this value will cause it to override any other value (such as database or user) defined
      // in the defaults object.
      connectionString: void 0,
      // database port
      port: 5432,
      // number of rows to return at a time from a prepared statement's
      // portal. 0 will return all rows at once
      rows: 0,
      // binary result mode
      binary: false,
      // Connection pool options - see https://github.com/brianc/node-pg-pool
      // number of connections to use in connection pool
      // 0 will disable connection pooling
      max: 10,
      // max milliseconds a client can go unused before it is removed
      // from the pool and destroyed
      idleTimeoutMillis: 3e4,
      client_encoding: "",
      ssl: false,
      application_name: void 0,
      fallback_application_name: void 0,
      options: void 0,
      parseInputDatesAsUTC: false,
      // max milliseconds any query using this connection will execute for before timing out in error.
      // false=unlimited
      statement_timeout: false,
      // Abort any statement that waits longer than the specified duration in milliseconds while attempting to acquire a lock.
      // false=unlimited
      lock_timeout: false,
      // Terminate any session with an open transaction that has been idle for longer than the specified duration in milliseconds
      // false=unlimited
      idle_in_transaction_session_timeout: false,
      // max milliseconds to wait for query to complete (client side)
      query_timeout: false,
      connect_timeout: 0,
      keepalives: 1,
      keepalives_idle: 0
    };
    var pgTypes = require_pg_types();
    var parseBigInteger = pgTypes.getTypeParser(20, "text");
    var parseBigIntegerArray = pgTypes.getTypeParser(1016, "text");
    module2.exports.__defineSetter__("parseInt8", function(val) {
      pgTypes.setTypeParser(20, "text", val ? pgTypes.getTypeParser(23, "text") : parseBigInteger);
      pgTypes.setTypeParser(1016, "text", val ? pgTypes.getTypeParser(1007, "text") : parseBigIntegerArray);
    });
  }
});

// node_modules/pg/lib/utils.js
var require_utils = __commonJS({
  "node_modules/pg/lib/utils.js"(exports2, module2) {
    "use strict";
    var defaults2 = require_defaults();
    var util = require("util");
    var { isDate } = util.types || util;
    function escapeElement(elementRepresentation) {
      const escaped = elementRepresentation.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return '"' + escaped + '"';
    }
    function arrayString(val) {
      let result = "{";
      for (let i = 0; i < val.length; i++) {
        if (i > 0) {
          result = result + ",";
        }
        if (val[i] === null || typeof val[i] === "undefined") {
          result = result + "NULL";
        } else if (Array.isArray(val[i])) {
          result = result + arrayString(val[i]);
        } else if (ArrayBuffer.isView(val[i])) {
          let item = val[i];
          if (!(item instanceof Buffer)) {
            const buf = Buffer.from(item.buffer, item.byteOffset, item.byteLength);
            if (buf.length === item.byteLength) {
              item = buf;
            } else {
              item = buf.slice(item.byteOffset, item.byteOffset + item.byteLength);
            }
          }
          result += "\\\\x" + item.toString("hex");
        } else {
          result += escapeElement(prepareValue(val[i]));
        }
      }
      result = result + "}";
      return result;
    }
    var prepareValue = function(val, seen) {
      if (val == null) {
        return null;
      }
      if (typeof val === "object") {
        if (val instanceof Buffer) {
          return val;
        }
        if (ArrayBuffer.isView(val)) {
          const buf = Buffer.from(val.buffer, val.byteOffset, val.byteLength);
          if (buf.length === val.byteLength) {
            return buf;
          }
          return buf.slice(val.byteOffset, val.byteOffset + val.byteLength);
        }
        if (isDate(val)) {
          if (defaults2.parseInputDatesAsUTC) {
            return dateToStringUTC(val);
          } else {
            return dateToString(val);
          }
        }
        if (Array.isArray(val)) {
          return arrayString(val);
        }
        return prepareObject(val, seen);
      }
      return val.toString();
    };
    function prepareObject(val, seen) {
      if (val && typeof val.toPostgres === "function") {
        seen = seen || [];
        if (seen.indexOf(val) !== -1) {
          throw new Error('circular reference detected while preparing "' + val + '" for query');
        }
        seen.push(val);
        return prepareValue(val.toPostgres(prepareValue), seen);
      }
      return JSON.stringify(val);
    }
    function dateToString(date) {
      let offset = -date.getTimezoneOffset();
      let year = date.getFullYear();
      const isBCYear = year < 1;
      if (isBCYear) year = Math.abs(year) + 1;
      let ret = String(year).padStart(4, "0") + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0") + "T" + String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0") + ":" + String(date.getSeconds()).padStart(2, "0") + "." + String(date.getMilliseconds()).padStart(3, "0");
      if (offset < 0) {
        ret += "-";
        offset *= -1;
      } else {
        ret += "+";
      }
      ret += String(Math.floor(offset / 60)).padStart(2, "0") + ":" + String(offset % 60).padStart(2, "0");
      if (isBCYear) ret += " BC";
      return ret;
    }
    function dateToStringUTC(date) {
      let year = date.getUTCFullYear();
      const isBCYear = year < 1;
      if (isBCYear) year = Math.abs(year) + 1;
      let ret = String(year).padStart(4, "0") + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0") + "T" + String(date.getUTCHours()).padStart(2, "0") + ":" + String(date.getUTCMinutes()).padStart(2, "0") + ":" + String(date.getUTCSeconds()).padStart(2, "0") + "." + String(date.getUTCMilliseconds()).padStart(3, "0");
      ret += "+00:00";
      if (isBCYear) ret += " BC";
      return ret;
    }
    function normalizeQueryConfig(config, values, callback) {
      config = typeof config === "string" ? { text: config } : config;
      if (values) {
        if (typeof values === "function") {
          config.callback = values;
        } else {
          config.values = values;
        }
      }
      if (callback) {
        config.callback = callback;
      }
      return config;
    }
    var escapeIdentifier2 = function(str) {
      return '"' + str.replace(/"/g, '""') + '"';
    };
    var escapeLiteral2 = function(str) {
      let hasBackslash = false;
      let escaped = "'";
      if (str == null) {
        return "''";
      }
      if (typeof str !== "string") {
        return "''";
      }
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (c === "'") {
          escaped += c + c;
        } else if (c === "\\") {
          escaped += c + c;
          hasBackslash = true;
        } else {
          escaped += c;
        }
      }
      escaped += "'";
      if (hasBackslash === true) {
        escaped = " E" + escaped;
      }
      return escaped;
    };
    module2.exports = {
      prepareValue: function prepareValueWrapper(value) {
        return prepareValue(value);
      },
      normalizeQueryConfig,
      escapeIdentifier: escapeIdentifier2,
      escapeLiteral: escapeLiteral2
    };
  }
});

// node_modules/pg/lib/crypto/utils-legacy.js
var require_utils_legacy = __commonJS({
  "node_modules/pg/lib/crypto/utils-legacy.js"(exports2, module2) {
    "use strict";
    var nodeCrypto = require("crypto");
    function md5(string) {
      return nodeCrypto.createHash("md5").update(string, "utf-8").digest("hex");
    }
    function postgresMd5PasswordHash(user, password, salt) {
      const inner = md5(password + user);
      const outer = md5(Buffer.concat([Buffer.from(inner), salt]));
      return "md5" + outer;
    }
    function sha256(text) {
      return nodeCrypto.createHash("sha256").update(text).digest();
    }
    function hashByName(hashName, text) {
      hashName = hashName.replace(/(\D)-/, "$1");
      return nodeCrypto.createHash(hashName).update(text).digest();
    }
    function hmacSha256(key, msg) {
      return nodeCrypto.createHmac("sha256", key).update(msg).digest();
    }
    async function deriveKey(password, salt, iterations) {
      return nodeCrypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
    }
    module2.exports = {
      postgresMd5PasswordHash,
      randomBytes: nodeCrypto.randomBytes,
      deriveKey,
      sha256,
      hashByName,
      hmacSha256,
      md5
    };
  }
});

// node_modules/pg/lib/crypto/utils-webcrypto.js
var require_utils_webcrypto = __commonJS({
  "node_modules/pg/lib/crypto/utils-webcrypto.js"(exports2, module2) {
    var nodeCrypto = require("crypto");
    module2.exports = {
      postgresMd5PasswordHash,
      randomBytes,
      deriveKey,
      sha256,
      hashByName,
      hmacSha256,
      md5
    };
    var webCrypto = nodeCrypto.webcrypto || globalThis.crypto;
    var subtleCrypto = webCrypto.subtle;
    var textEncoder = new TextEncoder();
    function randomBytes(length) {
      return webCrypto.getRandomValues(Buffer.alloc(length));
    }
    async function md5(string) {
      try {
        return nodeCrypto.createHash("md5").update(string, "utf-8").digest("hex");
      } catch (e) {
        const data = typeof string === "string" ? textEncoder.encode(string) : string;
        const hash = await subtleCrypto.digest("MD5", data);
        return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    }
    async function postgresMd5PasswordHash(user, password, salt) {
      const inner = await md5(password + user);
      const outer = await md5(Buffer.concat([Buffer.from(inner), salt]));
      return "md5" + outer;
    }
    async function sha256(text) {
      return await subtleCrypto.digest("SHA-256", text);
    }
    async function hashByName(hashName, text) {
      return await subtleCrypto.digest(hashName, text);
    }
    async function hmacSha256(keyBuffer, msg) {
      const key = await subtleCrypto.importKey("raw", keyBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      return await subtleCrypto.sign("HMAC", key, textEncoder.encode(msg));
    }
    async function deriveKey(password, salt, iterations) {
      const key = await subtleCrypto.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
      const params = { name: "PBKDF2", hash: "SHA-256", salt, iterations };
      return await subtleCrypto.deriveBits(params, key, 32 * 8, ["deriveBits"]);
    }
  }
});

// node_modules/pg/lib/crypto/utils.js
var require_utils2 = __commonJS({
  "node_modules/pg/lib/crypto/utils.js"(exports2, module2) {
    "use strict";
    var useLegacyCrypto = parseInt(process.versions && process.versions.node && process.versions.node.split(".")[0]) < 15;
    if (useLegacyCrypto) {
      module2.exports = require_utils_legacy();
    } else {
      module2.exports = require_utils_webcrypto();
    }
  }
});

// node_modules/pg/lib/crypto/cert-signatures.js
var require_cert_signatures = __commonJS({
  "node_modules/pg/lib/crypto/cert-signatures.js"(exports2, module2) {
    function x509Error(msg, cert) {
      return new Error("SASL channel binding: " + msg + " when parsing public certificate " + cert.toString("base64"));
    }
    function readASN1Length(data, index) {
      let length = data[index++];
      if (length < 128) return { length, index };
      const lengthBytes = length & 127;
      if (lengthBytes > 4) throw x509Error("bad length", data);
      length = 0;
      for (let i = 0; i < lengthBytes; i++) {
        length = length << 8 | data[index++];
      }
      return { length, index };
    }
    function readASN1OID(data, index) {
      if (data[index++] !== 6) throw x509Error("non-OID data", data);
      const { length: OIDLength, index: indexAfterOIDLength } = readASN1Length(data, index);
      index = indexAfterOIDLength;
      const lastIndex = index + OIDLength;
      const byte1 = data[index++];
      let oid = (byte1 / 40 >> 0) + "." + byte1 % 40;
      while (index < lastIndex) {
        let value = 0;
        while (index < lastIndex) {
          const nextByte = data[index++];
          value = value << 7 | nextByte & 127;
          if (nextByte < 128) break;
        }
        oid += "." + value;
      }
      return { oid, index };
    }
    function expectASN1Seq(data, index) {
      if (data[index++] !== 48) throw x509Error("non-sequence data", data);
      return readASN1Length(data, index);
    }
    function signatureAlgorithmHashFromCertificate(data, index) {
      if (index === void 0) index = 0;
      index = expectASN1Seq(data, index).index;
      const { length: certInfoLength, index: indexAfterCertInfoLength } = expectASN1Seq(data, index);
      index = indexAfterCertInfoLength + certInfoLength;
      index = expectASN1Seq(data, index).index;
      const { oid, index: indexAfterOID } = readASN1OID(data, index);
      switch (oid) {
        case "1.2.840.113549.1.1.4":
          return "MD5";
        case "1.2.840.113549.1.1.5":
          return "SHA-1";
        case "1.2.840.113549.1.1.11":
          return "SHA-256";
        case "1.2.840.113549.1.1.12":
          return "SHA-384";
        case "1.2.840.113549.1.1.13":
          return "SHA-512";
        case "1.2.840.113549.1.1.14":
          return "SHA-224";
        case "1.2.840.113549.1.1.15":
          return "SHA512-224";
        case "1.2.840.113549.1.1.16":
          return "SHA512-256";
        case "1.2.840.10045.4.1":
          return "SHA-1";
        case "1.2.840.10045.4.3.1":
          return "SHA-224";
        case "1.2.840.10045.4.3.2":
          return "SHA-256";
        case "1.2.840.10045.4.3.3":
          return "SHA-384";
        case "1.2.840.10045.4.3.4":
          return "SHA-512";
        case "1.2.840.113549.1.1.10": {
          index = indexAfterOID;
          index = expectASN1Seq(data, index).index;
          if (data[index++] !== 160) throw x509Error("non-tag data", data);
          index = readASN1Length(data, index).index;
          index = expectASN1Seq(data, index).index;
          const { oid: hashOID } = readASN1OID(data, index);
          switch (hashOID) {
            case "1.2.840.113549.2.5":
              return "MD5";
            case "1.3.14.3.2.26":
              return "SHA-1";
            case "2.16.840.1.101.3.4.2.1":
              return "SHA-256";
            case "2.16.840.1.101.3.4.2.2":
              return "SHA-384";
            case "2.16.840.1.101.3.4.2.3":
              return "SHA-512";
          }
          throw x509Error("unknown hash OID " + hashOID, data);
        }
        case "1.3.101.110":
        case "1.3.101.112":
          return "SHA-512";
        case "1.3.101.111":
        case "1.3.101.113":
          throw x509Error("Ed448 certificate channel binding is not currently supported by Postgres");
      }
      throw x509Error("unknown OID " + oid, data);
    }
    module2.exports = { signatureAlgorithmHashFromCertificate };
  }
});

// node_modules/pg/lib/crypto/sasl.js
var require_sasl = __commonJS({
  "node_modules/pg/lib/crypto/sasl.js"(exports2, module2) {
    "use strict";
    var crypto2 = require_utils2();
    var { signatureAlgorithmHashFromCertificate } = require_cert_signatures();
    function startSession(mechanisms, stream) {
      const candidates = ["SCRAM-SHA-256"];
      if (stream) candidates.unshift("SCRAM-SHA-256-PLUS");
      const mechanism = candidates.find((candidate) => mechanisms.includes(candidate));
      if (!mechanism) {
        throw new Error("SASL: Only mechanism(s) " + candidates.join(" and ") + " are supported");
      }
      if (mechanism === "SCRAM-SHA-256-PLUS" && typeof stream.getPeerCertificate !== "function") {
        throw new Error("SASL: Mechanism SCRAM-SHA-256-PLUS requires a certificate");
      }
      const clientNonce = crypto2.randomBytes(18).toString("base64");
      const gs2Header = mechanism === "SCRAM-SHA-256-PLUS" ? "p=tls-server-end-point" : stream ? "y" : "n";
      return {
        mechanism,
        clientNonce,
        response: gs2Header + ",,n=*,r=" + clientNonce,
        message: "SASLInitialResponse"
      };
    }
    async function continueSession(session, password, serverData, stream) {
      if (session.message !== "SASLInitialResponse") {
        throw new Error("SASL: Last message was not SASLInitialResponse");
      }
      if (typeof password !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string");
      }
      if (password === "") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string");
      }
      if (typeof serverData !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: serverData must be a string");
      }
      const sv = parseServerFirstMessage(serverData);
      if (!sv.nonce.startsWith(session.clientNonce)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce");
      } else if (sv.nonce.length === session.clientNonce.length) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short");
      }
      const clientFirstMessageBare = "n=*,r=" + session.clientNonce;
      const serverFirstMessage = "r=" + sv.nonce + ",s=" + sv.salt + ",i=" + sv.iteration;
      let channelBinding = stream ? "eSws" : "biws";
      if (session.mechanism === "SCRAM-SHA-256-PLUS") {
        const peerCert = stream.getPeerCertificate().raw;
        let hashName = signatureAlgorithmHashFromCertificate(peerCert);
        if (hashName === "MD5" || hashName === "SHA-1") hashName = "SHA-256";
        const certHash = await crypto2.hashByName(hashName, peerCert);
        const bindingData = Buffer.concat([Buffer.from("p=tls-server-end-point,,"), Buffer.from(certHash)]);
        channelBinding = bindingData.toString("base64");
      }
      const clientFinalMessageWithoutProof = "c=" + channelBinding + ",r=" + sv.nonce;
      const authMessage = clientFirstMessageBare + "," + serverFirstMessage + "," + clientFinalMessageWithoutProof;
      const saltBytes = Buffer.from(sv.salt, "base64");
      const saltedPassword = await crypto2.deriveKey(password, saltBytes, sv.iteration);
      const clientKey = await crypto2.hmacSha256(saltedPassword, "Client Key");
      const storedKey = await crypto2.sha256(clientKey);
      const clientSignature = await crypto2.hmacSha256(storedKey, authMessage);
      const clientProof = xorBuffers(Buffer.from(clientKey), Buffer.from(clientSignature)).toString("base64");
      const serverKey = await crypto2.hmacSha256(saltedPassword, "Server Key");
      const serverSignatureBytes = await crypto2.hmacSha256(serverKey, authMessage);
      session.message = "SASLResponse";
      session.serverSignature = Buffer.from(serverSignatureBytes).toString("base64");
      session.response = clientFinalMessageWithoutProof + ",p=" + clientProof;
    }
    function finalizeSession(session, serverData) {
      if (session.message !== "SASLResponse") {
        throw new Error("SASL: Last message was not SASLResponse");
      }
      if (typeof serverData !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: serverData must be a string");
      }
      const { serverSignature } = parseServerFinalMessage(serverData);
      if (serverSignature !== session.serverSignature) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match");
      }
    }
    function isPrintableChars(text) {
      if (typeof text !== "string") {
        throw new TypeError("SASL: text must be a string");
      }
      return text.split("").map((_, i) => text.charCodeAt(i)).every((c) => c >= 33 && c <= 43 || c >= 45 && c <= 126);
    }
    function isBase64(text) {
      return /^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(text);
    }
    function parseAttributePairs(text) {
      if (typeof text !== "string") {
        throw new TypeError("SASL: attribute pairs text must be a string");
      }
      return new Map(
        text.split(",").map((attrValue) => {
          if (!/^.=/.test(attrValue)) {
            throw new Error("SASL: Invalid attribute pair entry");
          }
          const name = attrValue[0];
          const value = attrValue.substring(2);
          return [name, value];
        })
      );
    }
    function parseServerFirstMessage(data) {
      const attrPairs = parseAttributePairs(data);
      const nonce = attrPairs.get("r");
      if (!nonce) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing");
      } else if (!isPrintableChars(nonce)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce must only contain printable characters");
      }
      const salt = attrPairs.get("s");
      if (!salt) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing");
      } else if (!isBase64(salt)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt must be base64");
      }
      const iterationText = attrPairs.get("i");
      if (!iterationText) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing");
      } else if (!/^[1-9][0-9]*$/.test(iterationText)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: invalid iteration count");
      }
      const iteration = parseInt(iterationText, 10);
      return {
        nonce,
        salt,
        iteration
      };
    }
    function parseServerFinalMessage(serverData) {
      const attrPairs = parseAttributePairs(serverData);
      const serverSignature = attrPairs.get("v");
      if (!serverSignature) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing");
      } else if (!isBase64(serverSignature)) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64");
      }
      return {
        serverSignature
      };
    }
    function xorBuffers(a, b) {
      if (!Buffer.isBuffer(a)) {
        throw new TypeError("first argument must be a Buffer");
      }
      if (!Buffer.isBuffer(b)) {
        throw new TypeError("second argument must be a Buffer");
      }
      if (a.length !== b.length) {
        throw new Error("Buffer lengths must match");
      }
      if (a.length === 0) {
        throw new Error("Buffers cannot be empty");
      }
      return Buffer.from(a.map((_, i) => a[i] ^ b[i]));
    }
    module2.exports = {
      startSession,
      continueSession,
      finalizeSession
    };
  }
});

// node_modules/pg/lib/type-overrides.js
var require_type_overrides = __commonJS({
  "node_modules/pg/lib/type-overrides.js"(exports2, module2) {
    "use strict";
    var types2 = require_pg_types();
    function TypeOverrides2(userTypes) {
      this._types = userTypes || types2;
      this.text = {};
      this.binary = {};
    }
    TypeOverrides2.prototype.getOverrides = function(format) {
      switch (format) {
        case "text":
          return this.text;
        case "binary":
          return this.binary;
        default:
          return {};
      }
    };
    TypeOverrides2.prototype.setTypeParser = function(oid, format, parseFn) {
      if (typeof format === "function") {
        parseFn = format;
        format = "text";
      }
      this.getOverrides(format)[oid] = parseFn;
    };
    TypeOverrides2.prototype.getTypeParser = function(oid, format) {
      format = format || "text";
      return this.getOverrides(format)[oid] || this._types.getTypeParser(oid, format);
    };
    module2.exports = TypeOverrides2;
  }
});

// node_modules/pg-connection-string/index.js
var require_pg_connection_string = __commonJS({
  "node_modules/pg-connection-string/index.js"(exports2, module2) {
    "use strict";
    function parse(str, options = {}) {
      if (str.charAt(0) === "/") {
        const config2 = str.split(" ");
        return { host: config2[0], database: config2[1] };
      }
      const config = {};
      let result;
      let dummyHost = false;
      if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(str)) {
        str = encodeURI(str).replace(/%25(\d\d)/g, "%$1");
      }
      try {
        try {
          result = new URL(str, "postgres://base");
        } catch (e) {
          result = new URL(str.replace("@/", "@___DUMMY___/"), "postgres://base");
          dummyHost = true;
        }
      } catch (err) {
        err.input && (err.input = "*****REDACTED*****");
        throw err;
      }
      for (const entry of result.searchParams.entries()) {
        config[entry[0]] = entry[1];
      }
      config.user = config.user || decodeURIComponent(result.username);
      config.password = config.password || decodeURIComponent(result.password);
      if (result.protocol == "socket:") {
        config.host = decodeURI(result.pathname);
        config.database = result.searchParams.get("db");
        config.client_encoding = result.searchParams.get("encoding");
        return config;
      }
      const hostname = dummyHost ? "" : result.hostname;
      if (!config.host) {
        config.host = decodeURIComponent(hostname);
      } else if (hostname && /^%2f/i.test(hostname)) {
        result.pathname = hostname + result.pathname;
      }
      if (!config.port) {
        config.port = result.port;
      }
      const pathname = result.pathname.slice(1) || null;
      config.database = pathname ? decodeURI(pathname) : null;
      if (config.ssl === "true" || config.ssl === "1") {
        config.ssl = true;
      }
      if (config.ssl === "0") {
        config.ssl = false;
      }
      if (config.sslcert || config.sslkey || config.sslrootcert || config.sslmode) {
        config.ssl = {};
      }
      const fs = config.sslcert || config.sslkey || config.sslrootcert ? require("fs") : null;
      if (config.sslcert) {
        config.ssl.cert = fs.readFileSync(config.sslcert).toString();
      }
      if (config.sslkey) {
        config.ssl.key = fs.readFileSync(config.sslkey).toString();
      }
      if (config.sslrootcert) {
        config.ssl.ca = fs.readFileSync(config.sslrootcert).toString();
      }
      if (options.useLibpqCompat && config.uselibpqcompat) {
        throw new Error("Both useLibpqCompat and uselibpqcompat are set. Please use only one of them.");
      }
      if (config.uselibpqcompat === "true" || options.useLibpqCompat) {
        switch (config.sslmode) {
          case "disable": {
            config.ssl = false;
            break;
          }
          case "prefer": {
            config.ssl.rejectUnauthorized = false;
            break;
          }
          case "require": {
            if (config.sslrootcert) {
              config.ssl.checkServerIdentity = function() {
              };
            } else {
              config.ssl.rejectUnauthorized = false;
            }
            break;
          }
          case "verify-ca": {
            if (!config.ssl.ca) {
              throw new Error(
                "SECURITY WARNING: Using sslmode=verify-ca requires specifying a CA with sslrootcert. If a public CA is used, verify-ca allows connections to a server that somebody else may have registered with the CA, making you vulnerable to Man-in-the-Middle attacks. Either specify a custom CA certificate with sslrootcert parameter or use sslmode=verify-full for proper security."
              );
            }
            config.ssl.checkServerIdentity = function() {
            };
            break;
          }
          case "verify-full": {
            break;
          }
        }
      } else {
        switch (config.sslmode) {
          case "disable": {
            config.ssl = false;
            break;
          }
          case "prefer":
          case "require":
          case "verify-ca":
          case "verify-full": {
            if (config.sslmode !== "verify-full") {
              deprecatedSslModeWarning(config.sslmode);
            }
            break;
          }
          case "no-verify": {
            config.ssl.rejectUnauthorized = false;
            break;
          }
        }
      }
      return config;
    }
    function toConnectionOptions(sslConfig) {
      const connectionOptions = Object.entries(sslConfig).reduce((c, [key, value]) => {
        if (value !== void 0 && value !== null) {
          c[key] = value;
        }
        return c;
      }, {});
      return connectionOptions;
    }
    function toClientConfig(config) {
      const poolConfig = Object.entries(config).reduce((c, [key, value]) => {
        if (key === "ssl") {
          const sslConfig = value;
          if (typeof sslConfig === "boolean") {
            c[key] = sslConfig;
          }
          if (typeof sslConfig === "object") {
            c[key] = toConnectionOptions(sslConfig);
          }
        } else if (value !== void 0 && value !== null) {
          if (key === "port") {
            if (value !== "") {
              const v = parseInt(value, 10);
              if (isNaN(v)) {
                throw new Error(`Invalid ${key}: ${value}`);
              }
              c[key] = v;
            }
          } else {
            c[key] = value;
          }
        }
        return c;
      }, {});
      return poolConfig;
    }
    function parseIntoClientConfig(str) {
      return toClientConfig(parse(str));
    }
    function deprecatedSslModeWarning(sslmode) {
      if (!deprecatedSslModeWarning.warned && typeof process !== "undefined" && process.emitWarning) {
        deprecatedSslModeWarning.warned = true;
        process.emitWarning(`SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=${sslmode}'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.`);
      }
    }
    module2.exports = parse;
    parse.parse = parse;
    parse.toClientConfig = toClientConfig;
    parse.parseIntoClientConfig = parseIntoClientConfig;
  }
});

// node_modules/pg/lib/connection-parameters.js
var require_connection_parameters = __commonJS({
  "node_modules/pg/lib/connection-parameters.js"(exports2, module2) {
    "use strict";
    var dns = require("dns");
    var defaults2 = require_defaults();
    var parse = require_pg_connection_string().parse;
    var val = function(key, config, envVar) {
      if (config[key]) {
        return config[key];
      }
      if (envVar === void 0) {
        envVar = process.env["PG" + key.toUpperCase()];
      } else if (envVar === false) {
      } else {
        envVar = process.env[envVar];
      }
      return envVar || defaults2[key];
    };
    var readSSLConfigFromEnvironment = function() {
      switch (process.env.PGSSLMODE) {
        case "disable":
          return false;
        case "prefer":
        case "require":
        case "verify-ca":
        case "verify-full":
          return true;
        case "no-verify":
          return { rejectUnauthorized: false };
      }
      return defaults2.ssl;
    };
    var quoteParamValue = function(value) {
      return "'" + ("" + value).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
    };
    var add = function(params, config, paramName) {
      const value = config[paramName];
      if (value !== void 0 && value !== null) {
        params.push(paramName + "=" + quoteParamValue(value));
      }
    };
    var ConnectionParameters = class {
      constructor(config) {
        config = typeof config === "string" ? parse(config) : config || {};
        if (config.connectionString) {
          config = Object.assign({}, config, parse(config.connectionString));
        }
        this.user = val("user", config);
        this.database = val("database", config);
        if (this.database === void 0) {
          this.database = this.user;
        }
        this.port = parseInt(val("port", config), 10);
        this.host = val("host", config);
        Object.defineProperty(this, "password", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: val("password", config)
        });
        this.binary = val("binary", config);
        this.options = val("options", config);
        this.ssl = typeof config.ssl === "undefined" ? readSSLConfigFromEnvironment() : config.ssl;
        if (typeof this.ssl === "string") {
          if (this.ssl === "true") {
            this.ssl = true;
          }
        }
        if (this.ssl === "no-verify") {
          this.ssl = { rejectUnauthorized: false };
        }
        if (this.ssl && this.ssl.key) {
          Object.defineProperty(this.ssl, "key", {
            enumerable: false
          });
        }
        this.client_encoding = val("client_encoding", config);
        this.replication = val("replication", config);
        this.isDomainSocket = !(this.host || "").indexOf("/");
        this.application_name = val("application_name", config, "PGAPPNAME");
        this.fallback_application_name = val("fallback_application_name", config, false);
        this.statement_timeout = val("statement_timeout", config, false);
        this.lock_timeout = val("lock_timeout", config, false);
        this.idle_in_transaction_session_timeout = val("idle_in_transaction_session_timeout", config, false);
        this.query_timeout = val("query_timeout", config, false);
        if (config.connectionTimeoutMillis === void 0) {
          this.connect_timeout = process.env.PGCONNECT_TIMEOUT || 0;
        } else {
          this.connect_timeout = Math.floor(config.connectionTimeoutMillis / 1e3);
        }
        if (config.keepAlive === false) {
          this.keepalives = 0;
        } else if (config.keepAlive === true) {
          this.keepalives = 1;
        }
        if (typeof config.keepAliveInitialDelayMillis === "number") {
          this.keepalives_idle = Math.floor(config.keepAliveInitialDelayMillis / 1e3);
        }
      }
      getLibpqConnectionString(cb) {
        const params = [];
        add(params, this, "user");
        add(params, this, "password");
        add(params, this, "port");
        add(params, this, "application_name");
        add(params, this, "fallback_application_name");
        add(params, this, "connect_timeout");
        add(params, this, "options");
        const ssl = typeof this.ssl === "object" ? this.ssl : this.ssl ? { sslmode: this.ssl } : {};
        add(params, ssl, "sslmode");
        add(params, ssl, "sslca");
        add(params, ssl, "sslkey");
        add(params, ssl, "sslcert");
        add(params, ssl, "sslrootcert");
        if (this.database) {
          params.push("dbname=" + quoteParamValue(this.database));
        }
        if (this.replication) {
          params.push("replication=" + quoteParamValue(this.replication));
        }
        if (this.host) {
          params.push("host=" + quoteParamValue(this.host));
        }
        if (this.isDomainSocket) {
          return cb(null, params.join(" "));
        }
        if (this.client_encoding) {
          params.push("client_encoding=" + quoteParamValue(this.client_encoding));
        }
        dns.lookup(this.host, function(err, address) {
          if (err) return cb(err, null);
          params.push("hostaddr=" + quoteParamValue(address));
          return cb(null, params.join(" "));
        });
      }
    };
    module2.exports = ConnectionParameters;
  }
});

// node_modules/pg/lib/result.js
var require_result = __commonJS({
  "node_modules/pg/lib/result.js"(exports2, module2) {
    "use strict";
    var types2 = require_pg_types();
    var matchRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/;
    var Result2 = class {
      constructor(rowMode, types3) {
        this.command = null;
        this.rowCount = null;
        this.oid = null;
        this.rows = [];
        this.fields = [];
        this._parsers = void 0;
        this._types = types3;
        this.RowCtor = null;
        this.rowAsArray = rowMode === "array";
        if (this.rowAsArray) {
          this.parseRow = this._parseRowAsArray;
        }
        this._prebuiltEmptyResultObject = null;
      }
      // adds a command complete message
      addCommandComplete(msg) {
        let match;
        if (msg.text) {
          match = matchRegexp.exec(msg.text);
        } else {
          match = matchRegexp.exec(msg.command);
        }
        if (match) {
          this.command = match[1];
          if (match[3]) {
            this.oid = parseInt(match[2], 10);
            this.rowCount = parseInt(match[3], 10);
          } else if (match[2]) {
            this.rowCount = parseInt(match[2], 10);
          }
        }
      }
      _parseRowAsArray(rowData) {
        const row = new Array(rowData.length);
        for (let i = 0, len = rowData.length; i < len; i++) {
          const rawValue = rowData[i];
          if (rawValue !== null) {
            row[i] = this._parsers[i](rawValue);
          } else {
            row[i] = null;
          }
        }
        return row;
      }
      parseRow(rowData) {
        const row = { ...this._prebuiltEmptyResultObject };
        for (let i = 0, len = rowData.length; i < len; i++) {
          const rawValue = rowData[i];
          const field = this.fields[i].name;
          if (rawValue !== null) {
            const v = this.fields[i].format === "binary" ? Buffer.from(rawValue) : rawValue;
            row[field] = this._parsers[i](v);
          } else {
            row[field] = null;
          }
        }
        return row;
      }
      addRow(row) {
        this.rows.push(row);
      }
      addFields(fieldDescriptions) {
        this.fields = fieldDescriptions;
        if (this.fields.length) {
          this._parsers = new Array(fieldDescriptions.length);
        }
        const row = {};
        for (let i = 0; i < fieldDescriptions.length; i++) {
          const desc = fieldDescriptions[i];
          row[desc.name] = null;
          if (this._types) {
            this._parsers[i] = this._types.getTypeParser(desc.dataTypeID, desc.format || "text");
          } else {
            this._parsers[i] = types2.getTypeParser(desc.dataTypeID, desc.format || "text");
          }
        }
        this._prebuiltEmptyResultObject = { ...row };
      }
    };
    module2.exports = Result2;
  }
});

// node_modules/pg/lib/query.js
var require_query = __commonJS({
  "node_modules/pg/lib/query.js"(exports2, module2) {
    "use strict";
    var { EventEmitter: EventEmitter4 } = require("events");
    var Result2 = require_result();
    var utils = require_utils();
    var Query2 = class extends EventEmitter4 {
      constructor(config, values, callback) {
        super();
        config = utils.normalizeQueryConfig(config, values, callback);
        this.text = config.text;
        this.values = config.values;
        this.rows = config.rows;
        this.types = config.types;
        this.name = config.name;
        this.queryMode = config.queryMode;
        this.binary = config.binary;
        this.portal = config.portal || "";
        this.callback = config.callback;
        this._rowMode = config.rowMode;
        if (process.domain && config.callback) {
          this.callback = process.domain.bind(config.callback);
        }
        this._result = new Result2(this._rowMode, this.types);
        this._results = this._result;
        this._canceledDueToError = false;
      }
      requiresPreparation() {
        if (this.queryMode === "extended") {
          return true;
        }
        if (this.name) {
          return true;
        }
        if (this.rows) {
          return true;
        }
        if (!this.text) {
          return false;
        }
        if (!this.values) {
          return false;
        }
        return this.values.length > 0;
      }
      _checkForMultirow() {
        if (this._result.command) {
          if (!Array.isArray(this._results)) {
            this._results = [this._result];
          }
          this._result = new Result2(this._rowMode, this._result._types);
          this._results.push(this._result);
        }
      }
      // associates row metadata from the supplied
      // message with this query object
      // metadata used when parsing row results
      handleRowDescription(msg) {
        this._checkForMultirow();
        this._result.addFields(msg.fields);
        this._accumulateRows = this.callback || !this.listeners("row").length;
      }
      handleDataRow(msg) {
        let row;
        if (this._canceledDueToError) {
          return;
        }
        try {
          row = this._result.parseRow(msg.fields);
        } catch (err) {
          this._canceledDueToError = err;
          return;
        }
        this.emit("row", row, this._result);
        if (this._accumulateRows) {
          this._result.addRow(row);
        }
      }
      handleCommandComplete(msg, connection) {
        this._checkForMultirow();
        this._result.addCommandComplete(msg);
        if (this.rows) {
          connection.sync();
        }
      }
      // if a named prepared statement is created with empty query text
      // the backend will send an emptyQuery message but *not* a command complete message
      // since we pipeline sync immediately after execute we don't need to do anything here
      // unless we have rows specified, in which case we did not pipeline the initial sync call
      handleEmptyQuery(connection) {
        if (this.rows) {
          connection.sync();
        }
      }
      handleError(err, connection) {
        if (this._canceledDueToError) {
          err = this._canceledDueToError;
          this._canceledDueToError = false;
        }
        if (this.callback) {
          return this.callback(err);
        }
        this.emit("error", err);
      }
      handleReadyForQuery(con) {
        if (this._canceledDueToError) {
          return this.handleError(this._canceledDueToError, con);
        }
        if (this.callback) {
          try {
            this.callback(null, this._results);
          } catch (err) {
            process.nextTick(() => {
              throw err;
            });
          }
        }
        this.emit("end", this._results);
      }
      submit(connection) {
        if (typeof this.text !== "string" && typeof this.name !== "string") {
          return new Error("A query must have either text or a name. Supplying neither is unsupported.");
        }
        const previous = connection.parsedStatements[this.name];
        if (this.text && previous && this.text !== previous) {
          return new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
        }
        if (this.values && !Array.isArray(this.values)) {
          return new Error("Query values must be an array");
        }
        if (this.requiresPreparation()) {
          connection.stream.cork && connection.stream.cork();
          try {
            this.prepare(connection);
          } finally {
            connection.stream.uncork && connection.stream.uncork();
          }
        } else {
          connection.query(this.text);
        }
        return null;
      }
      hasBeenParsed(connection) {
        return this.name && connection.parsedStatements[this.name];
      }
      handlePortalSuspended(connection) {
        this._getRows(connection, this.rows);
      }
      _getRows(connection, rows) {
        connection.execute({
          portal: this.portal,
          rows
        });
        if (!rows) {
          connection.sync();
        } else {
          connection.flush();
        }
      }
      // http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
      prepare(connection) {
        if (!this.hasBeenParsed(connection)) {
          connection.parse({
            text: this.text,
            name: this.name,
            types: this.types
          });
        }
        try {
          connection.bind({
            portal: this.portal,
            statement: this.name,
            values: this.values,
            binary: this.binary,
            valueMapper: utils.prepareValue
          });
        } catch (err) {
          this.handleError(err, connection);
          return;
        }
        connection.describe({
          type: "P",
          name: this.portal || ""
        });
        this._getRows(connection, this.rows);
      }
      handleCopyInResponse(connection) {
        connection.sendCopyFail("No source stream defined");
      }
      handleCopyData(msg, connection) {
      }
    };
    module2.exports = Query2;
  }
});

// node_modules/pg-protocol/dist/messages.js
var require_messages = __commonJS({
  "node_modules/pg-protocol/dist/messages.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.NoticeMessage = exports2.DataRowMessage = exports2.CommandCompleteMessage = exports2.ReadyForQueryMessage = exports2.NotificationResponseMessage = exports2.BackendKeyDataMessage = exports2.AuthenticationMD5Password = exports2.ParameterStatusMessage = exports2.ParameterDescriptionMessage = exports2.RowDescriptionMessage = exports2.Field = exports2.CopyResponse = exports2.CopyDataMessage = exports2.DatabaseError = exports2.copyDone = exports2.emptyQuery = exports2.replicationStart = exports2.portalSuspended = exports2.noData = exports2.closeComplete = exports2.bindComplete = exports2.parseComplete = void 0;
    exports2.parseComplete = {
      name: "parseComplete",
      length: 5
    };
    exports2.bindComplete = {
      name: "bindComplete",
      length: 5
    };
    exports2.closeComplete = {
      name: "closeComplete",
      length: 5
    };
    exports2.noData = {
      name: "noData",
      length: 5
    };
    exports2.portalSuspended = {
      name: "portalSuspended",
      length: 5
    };
    exports2.replicationStart = {
      name: "replicationStart",
      length: 4
    };
    exports2.emptyQuery = {
      name: "emptyQuery",
      length: 4
    };
    exports2.copyDone = {
      name: "copyDone",
      length: 4
    };
    var DatabaseError2 = class extends Error {
      constructor(message, length, name) {
        super(message);
        this.length = length;
        this.name = name;
      }
    };
    exports2.DatabaseError = DatabaseError2;
    var CopyDataMessage = class {
      constructor(length, chunk) {
        this.length = length;
        this.chunk = chunk;
        this.name = "copyData";
      }
    };
    exports2.CopyDataMessage = CopyDataMessage;
    var CopyResponse = class {
      constructor(length, name, binary, columnCount) {
        this.length = length;
        this.name = name;
        this.binary = binary;
        this.columnTypes = new Array(columnCount);
      }
    };
    exports2.CopyResponse = CopyResponse;
    var Field = class {
      constructor(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, format) {
        this.name = name;
        this.tableID = tableID;
        this.columnID = columnID;
        this.dataTypeID = dataTypeID;
        this.dataTypeSize = dataTypeSize;
        this.dataTypeModifier = dataTypeModifier;
        this.format = format;
      }
    };
    exports2.Field = Field;
    var RowDescriptionMessage = class {
      constructor(length, fieldCount) {
        this.length = length;
        this.fieldCount = fieldCount;
        this.name = "rowDescription";
        this.fields = new Array(this.fieldCount);
      }
    };
    exports2.RowDescriptionMessage = RowDescriptionMessage;
    var ParameterDescriptionMessage = class {
      constructor(length, parameterCount) {
        this.length = length;
        this.parameterCount = parameterCount;
        this.name = "parameterDescription";
        this.dataTypeIDs = new Array(this.parameterCount);
      }
    };
    exports2.ParameterDescriptionMessage = ParameterDescriptionMessage;
    var ParameterStatusMessage = class {
      constructor(length, parameterName, parameterValue) {
        this.length = length;
        this.parameterName = parameterName;
        this.parameterValue = parameterValue;
        this.name = "parameterStatus";
      }
    };
    exports2.ParameterStatusMessage = ParameterStatusMessage;
    var AuthenticationMD5Password = class {
      constructor(length, salt) {
        this.length = length;
        this.salt = salt;
        this.name = "authenticationMD5Password";
      }
    };
    exports2.AuthenticationMD5Password = AuthenticationMD5Password;
    var BackendKeyDataMessage = class {
      constructor(length, processID, secretKey) {
        this.length = length;
        this.processID = processID;
        this.secretKey = secretKey;
        this.name = "backendKeyData";
      }
    };
    exports2.BackendKeyDataMessage = BackendKeyDataMessage;
    var NotificationResponseMessage = class {
      constructor(length, processId, channel, payload) {
        this.length = length;
        this.processId = processId;
        this.channel = channel;
        this.payload = payload;
        this.name = "notification";
      }
    };
    exports2.NotificationResponseMessage = NotificationResponseMessage;
    var ReadyForQueryMessage = class {
      constructor(length, status) {
        this.length = length;
        this.status = status;
        this.name = "readyForQuery";
      }
    };
    exports2.ReadyForQueryMessage = ReadyForQueryMessage;
    var CommandCompleteMessage = class {
      constructor(length, text) {
        this.length = length;
        this.text = text;
        this.name = "commandComplete";
      }
    };
    exports2.CommandCompleteMessage = CommandCompleteMessage;
    var DataRowMessage = class {
      constructor(length, fields) {
        this.length = length;
        this.fields = fields;
        this.name = "dataRow";
        this.fieldCount = fields.length;
      }
    };
    exports2.DataRowMessage = DataRowMessage;
    var NoticeMessage = class {
      constructor(length, message) {
        this.length = length;
        this.message = message;
        this.name = "notice";
      }
    };
    exports2.NoticeMessage = NoticeMessage;
  }
});

// node_modules/pg-protocol/dist/buffer-writer.js
var require_buffer_writer = __commonJS({
  "node_modules/pg-protocol/dist/buffer-writer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Writer = void 0;
    var Writer = class {
      constructor(size = 256) {
        this.size = size;
        this.offset = 5;
        this.headerPosition = 0;
        this.buffer = Buffer.allocUnsafe(size);
      }
      ensure(size) {
        const remaining = this.buffer.length - this.offset;
        if (remaining < size) {
          const oldBuffer = this.buffer;
          const newSize = oldBuffer.length + (oldBuffer.length >> 1) + size;
          this.buffer = Buffer.allocUnsafe(newSize);
          oldBuffer.copy(this.buffer);
        }
      }
      addInt32(num) {
        this.ensure(4);
        this.buffer[this.offset++] = num >>> 24 & 255;
        this.buffer[this.offset++] = num >>> 16 & 255;
        this.buffer[this.offset++] = num >>> 8 & 255;
        this.buffer[this.offset++] = num >>> 0 & 255;
        return this;
      }
      addInt16(num) {
        this.ensure(2);
        this.buffer[this.offset++] = num >>> 8 & 255;
        this.buffer[this.offset++] = num >>> 0 & 255;
        return this;
      }
      addCString(string) {
        if (!string) {
          this.ensure(1);
        } else {
          const len = Buffer.byteLength(string);
          this.ensure(len + 1);
          this.buffer.write(string, this.offset, "utf-8");
          this.offset += len;
        }
        this.buffer[this.offset++] = 0;
        return this;
      }
      addString(string = "") {
        const len = Buffer.byteLength(string);
        this.ensure(len);
        this.buffer.write(string, this.offset);
        this.offset += len;
        return this;
      }
      add(otherBuffer) {
        this.ensure(otherBuffer.length);
        otherBuffer.copy(this.buffer, this.offset);
        this.offset += otherBuffer.length;
        return this;
      }
      join(code) {
        if (code) {
          this.buffer[this.headerPosition] = code;
          const length = this.offset - (this.headerPosition + 1);
          this.buffer.writeInt32BE(length, this.headerPosition + 1);
        }
        return this.buffer.slice(code ? 0 : 5, this.offset);
      }
      flush(code) {
        const result = this.join(code);
        this.offset = 5;
        this.headerPosition = 0;
        this.buffer = Buffer.allocUnsafe(this.size);
        return result;
      }
    };
    exports2.Writer = Writer;
  }
});

// node_modules/pg-protocol/dist/serializer.js
var require_serializer = __commonJS({
  "node_modules/pg-protocol/dist/serializer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.serialize = void 0;
    var buffer_writer_1 = require_buffer_writer();
    var writer = new buffer_writer_1.Writer();
    var startup = (opts) => {
      writer.addInt16(3).addInt16(0);
      for (const key of Object.keys(opts)) {
        writer.addCString(key).addCString(opts[key]);
      }
      writer.addCString("client_encoding").addCString("UTF8");
      const bodyBuffer = writer.addCString("").flush();
      const length = bodyBuffer.length + 4;
      return new buffer_writer_1.Writer().addInt32(length).add(bodyBuffer).flush();
    };
    var requestSsl = () => {
      const response = Buffer.allocUnsafe(8);
      response.writeInt32BE(8, 0);
      response.writeInt32BE(80877103, 4);
      return response;
    };
    var password = (password2) => {
      return writer.addCString(password2).flush(
        112
        /* code.startup */
      );
    };
    var sendSASLInitialResponseMessage = function(mechanism, initialResponse) {
      writer.addCString(mechanism).addInt32(Buffer.byteLength(initialResponse)).addString(initialResponse);
      return writer.flush(
        112
        /* code.startup */
      );
    };
    var sendSCRAMClientFinalMessage = function(additionalData) {
      return writer.addString(additionalData).flush(
        112
        /* code.startup */
      );
    };
    var query = (text) => {
      return writer.addCString(text).flush(
        81
        /* code.query */
      );
    };
    var emptyArray = [];
    var parse = (query2) => {
      const name = query2.name || "";
      if (name.length > 63) {
        console.error("Warning! Postgres only supports 63 characters for query names.");
        console.error("You supplied %s (%s)", name, name.length);
        console.error("This can cause conflicts and silent errors executing queries");
      }
      const types2 = query2.types || emptyArray;
      const len = types2.length;
      const buffer = writer.addCString(name).addCString(query2.text).addInt16(len);
      for (let i = 0; i < len; i++) {
        buffer.addInt32(types2[i]);
      }
      return writer.flush(
        80
        /* code.parse */
      );
    };
    var paramWriter = new buffer_writer_1.Writer();
    var writeValues = function(values, valueMapper) {
      for (let i = 0; i < values.length; i++) {
        const mappedVal = valueMapper ? valueMapper(values[i], i) : values[i];
        if (mappedVal == null) {
          writer.addInt16(
            0
            /* ParamType.STRING */
          );
          paramWriter.addInt32(-1);
        } else if (mappedVal instanceof Buffer) {
          writer.addInt16(
            1
            /* ParamType.BINARY */
          );
          paramWriter.addInt32(mappedVal.length);
          paramWriter.add(mappedVal);
        } else {
          writer.addInt16(
            0
            /* ParamType.STRING */
          );
          paramWriter.addInt32(Buffer.byteLength(mappedVal));
          paramWriter.addString(mappedVal);
        }
      }
    };
    var bind = (config = {}) => {
      const portal = config.portal || "";
      const statement = config.statement || "";
      const binary = config.binary || false;
      const values = config.values || emptyArray;
      const len = values.length;
      writer.addCString(portal).addCString(statement);
      writer.addInt16(len);
      writeValues(values, config.valueMapper);
      writer.addInt16(len);
      writer.add(paramWriter.flush());
      writer.addInt16(1);
      writer.addInt16(
        binary ? 1 : 0
        /* ParamType.STRING */
      );
      return writer.flush(
        66
        /* code.bind */
      );
    };
    var emptyExecute = Buffer.from([69, 0, 0, 0, 9, 0, 0, 0, 0, 0]);
    var execute = (config) => {
      if (!config || !config.portal && !config.rows) {
        return emptyExecute;
      }
      const portal = config.portal || "";
      const rows = config.rows || 0;
      const portalLength = Buffer.byteLength(portal);
      const len = 4 + portalLength + 1 + 4;
      const buff = Buffer.allocUnsafe(1 + len);
      buff[0] = 69;
      buff.writeInt32BE(len, 1);
      buff.write(portal, 5, "utf-8");
      buff[portalLength + 5] = 0;
      buff.writeUInt32BE(rows, buff.length - 4);
      return buff;
    };
    var cancel = (processID, secretKey) => {
      const buffer = Buffer.allocUnsafe(16);
      buffer.writeInt32BE(16, 0);
      buffer.writeInt16BE(1234, 4);
      buffer.writeInt16BE(5678, 6);
      buffer.writeInt32BE(processID, 8);
      buffer.writeInt32BE(secretKey, 12);
      return buffer;
    };
    var cstringMessage = (code, string) => {
      const stringLen = Buffer.byteLength(string);
      const len = 4 + stringLen + 1;
      const buffer = Buffer.allocUnsafe(1 + len);
      buffer[0] = code;
      buffer.writeInt32BE(len, 1);
      buffer.write(string, 5, "utf-8");
      buffer[len] = 0;
      return buffer;
    };
    var emptyDescribePortal = writer.addCString("P").flush(
      68
      /* code.describe */
    );
    var emptyDescribeStatement = writer.addCString("S").flush(
      68
      /* code.describe */
    );
    var describe = (msg) => {
      return msg.name ? cstringMessage(68, `${msg.type}${msg.name || ""}`) : msg.type === "P" ? emptyDescribePortal : emptyDescribeStatement;
    };
    var close = (msg) => {
      const text = `${msg.type}${msg.name || ""}`;
      return cstringMessage(67, text);
    };
    var copyData = (chunk) => {
      return writer.add(chunk).flush(
        100
        /* code.copyFromChunk */
      );
    };
    var copyFail = (message) => {
      return cstringMessage(102, message);
    };
    var codeOnlyBuffer = (code) => Buffer.from([code, 0, 0, 0, 4]);
    var flushBuffer = codeOnlyBuffer(
      72
      /* code.flush */
    );
    var syncBuffer = codeOnlyBuffer(
      83
      /* code.sync */
    );
    var endBuffer = codeOnlyBuffer(
      88
      /* code.end */
    );
    var copyDoneBuffer = codeOnlyBuffer(
      99
      /* code.copyDone */
    );
    var serialize = {
      startup,
      password,
      requestSsl,
      sendSASLInitialResponseMessage,
      sendSCRAMClientFinalMessage,
      query,
      parse,
      bind,
      execute,
      describe,
      close,
      flush: () => flushBuffer,
      sync: () => syncBuffer,
      end: () => endBuffer,
      copyData,
      copyDone: () => copyDoneBuffer,
      copyFail,
      cancel
    };
    exports2.serialize = serialize;
  }
});

// node_modules/pg-protocol/dist/buffer-reader.js
var require_buffer_reader = __commonJS({
  "node_modules/pg-protocol/dist/buffer-reader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.BufferReader = void 0;
    var BufferReader = class {
      constructor(offset = 0) {
        this.offset = offset;
        this.buffer = Buffer.allocUnsafe(0);
        this.encoding = "utf-8";
      }
      setBuffer(offset, buffer) {
        this.offset = offset;
        this.buffer = buffer;
      }
      int16() {
        const result = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return result;
      }
      byte() {
        const result = this.buffer[this.offset];
        this.offset++;
        return result;
      }
      int32() {
        const result = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return result;
      }
      uint32() {
        const result = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return result;
      }
      string(length) {
        const result = this.buffer.toString(this.encoding, this.offset, this.offset + length);
        this.offset += length;
        return result;
      }
      cstring() {
        const start = this.offset;
        let end = start;
        while (this.buffer[end++] !== 0) {
        }
        this.offset = end;
        return this.buffer.toString(this.encoding, start, end - 1);
      }
      bytes(length) {
        const result = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return result;
      }
    };
    exports2.BufferReader = BufferReader;
  }
});

// node_modules/pg-protocol/dist/parser.js
var require_parser = __commonJS({
  "node_modules/pg-protocol/dist/parser.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Parser = void 0;
    var messages_1 = require_messages();
    var buffer_reader_1 = require_buffer_reader();
    var CODE_LENGTH = 1;
    var LEN_LENGTH = 4;
    var HEADER_LENGTH = CODE_LENGTH + LEN_LENGTH;
    var LATEINIT_LENGTH = -1;
    var emptyBuffer = Buffer.allocUnsafe(0);
    var Parser = class {
      constructor(opts) {
        this.buffer = emptyBuffer;
        this.bufferLength = 0;
        this.bufferOffset = 0;
        this.reader = new buffer_reader_1.BufferReader();
        if ((opts === null || opts === void 0 ? void 0 : opts.mode) === "binary") {
          throw new Error("Binary mode not supported yet");
        }
        this.mode = (opts === null || opts === void 0 ? void 0 : opts.mode) || "text";
      }
      parse(buffer, callback) {
        this.mergeBuffer(buffer);
        const bufferFullLength = this.bufferOffset + this.bufferLength;
        let offset = this.bufferOffset;
        while (offset + HEADER_LENGTH <= bufferFullLength) {
          const code = this.buffer[offset];
          const length = this.buffer.readUInt32BE(offset + CODE_LENGTH);
          const fullMessageLength = CODE_LENGTH + length;
          if (fullMessageLength + offset <= bufferFullLength) {
            const message = this.handlePacket(offset + HEADER_LENGTH, code, length, this.buffer);
            callback(message);
            offset += fullMessageLength;
          } else {
            break;
          }
        }
        if (offset === bufferFullLength) {
          this.buffer = emptyBuffer;
          this.bufferLength = 0;
          this.bufferOffset = 0;
        } else {
          this.bufferLength = bufferFullLength - offset;
          this.bufferOffset = offset;
        }
      }
      mergeBuffer(buffer) {
        if (this.bufferLength > 0) {
          const newLength = this.bufferLength + buffer.byteLength;
          const newFullLength = newLength + this.bufferOffset;
          if (newFullLength > this.buffer.byteLength) {
            let newBuffer;
            if (newLength <= this.buffer.byteLength && this.bufferOffset >= this.bufferLength) {
              newBuffer = this.buffer;
            } else {
              let newBufferLength = this.buffer.byteLength * 2;
              while (newLength >= newBufferLength) {
                newBufferLength *= 2;
              }
              newBuffer = Buffer.allocUnsafe(newBufferLength);
            }
            this.buffer.copy(newBuffer, 0, this.bufferOffset, this.bufferOffset + this.bufferLength);
            this.buffer = newBuffer;
            this.bufferOffset = 0;
          }
          buffer.copy(this.buffer, this.bufferOffset + this.bufferLength);
          this.bufferLength = newLength;
        } else {
          this.buffer = buffer;
          this.bufferOffset = 0;
          this.bufferLength = buffer.byteLength;
        }
      }
      handlePacket(offset, code, length, bytes) {
        const { reader } = this;
        reader.setBuffer(offset, bytes);
        let message;
        switch (code) {
          case 50:
            message = messages_1.bindComplete;
            break;
          case 49:
            message = messages_1.parseComplete;
            break;
          case 51:
            message = messages_1.closeComplete;
            break;
          case 110:
            message = messages_1.noData;
            break;
          case 115:
            message = messages_1.portalSuspended;
            break;
          case 99:
            message = messages_1.copyDone;
            break;
          case 87:
            message = messages_1.replicationStart;
            break;
          case 73:
            message = messages_1.emptyQuery;
            break;
          case 68:
            message = parseDataRowMessage(reader);
            break;
          case 67:
            message = parseCommandCompleteMessage(reader);
            break;
          case 90:
            message = parseReadyForQueryMessage(reader);
            break;
          case 65:
            message = parseNotificationMessage(reader);
            break;
          case 82:
            message = parseAuthenticationResponse(reader, length);
            break;
          case 83:
            message = parseParameterStatusMessage(reader);
            break;
          case 75:
            message = parseBackendKeyData(reader);
            break;
          case 69:
            message = parseErrorMessage(reader, "error");
            break;
          case 78:
            message = parseErrorMessage(reader, "notice");
            break;
          case 84:
            message = parseRowDescriptionMessage(reader);
            break;
          case 116:
            message = parseParameterDescriptionMessage(reader);
            break;
          case 71:
            message = parseCopyInMessage(reader);
            break;
          case 72:
            message = parseCopyOutMessage(reader);
            break;
          case 100:
            message = parseCopyData(reader, length);
            break;
          default:
            return new messages_1.DatabaseError("received invalid response: " + code.toString(16), length, "error");
        }
        reader.setBuffer(0, emptyBuffer);
        message.length = length;
        return message;
      }
    };
    exports2.Parser = Parser;
    var parseReadyForQueryMessage = (reader) => {
      const status = reader.string(1);
      return new messages_1.ReadyForQueryMessage(LATEINIT_LENGTH, status);
    };
    var parseCommandCompleteMessage = (reader) => {
      const text = reader.cstring();
      return new messages_1.CommandCompleteMessage(LATEINIT_LENGTH, text);
    };
    var parseCopyData = (reader, length) => {
      const chunk = reader.bytes(length - 4);
      return new messages_1.CopyDataMessage(LATEINIT_LENGTH, chunk);
    };
    var parseCopyInMessage = (reader) => parseCopyMessage(reader, "copyInResponse");
    var parseCopyOutMessage = (reader) => parseCopyMessage(reader, "copyOutResponse");
    var parseCopyMessage = (reader, messageName) => {
      const isBinary = reader.byte() !== 0;
      const columnCount = reader.int16();
      const message = new messages_1.CopyResponse(LATEINIT_LENGTH, messageName, isBinary, columnCount);
      for (let i = 0; i < columnCount; i++) {
        message.columnTypes[i] = reader.int16();
      }
      return message;
    };
    var parseNotificationMessage = (reader) => {
      const processId = reader.int32();
      const channel = reader.cstring();
      const payload = reader.cstring();
      return new messages_1.NotificationResponseMessage(LATEINIT_LENGTH, processId, channel, payload);
    };
    var parseRowDescriptionMessage = (reader) => {
      const fieldCount = reader.int16();
      const message = new messages_1.RowDescriptionMessage(LATEINIT_LENGTH, fieldCount);
      for (let i = 0; i < fieldCount; i++) {
        message.fields[i] = parseField(reader);
      }
      return message;
    };
    var parseField = (reader) => {
      const name = reader.cstring();
      const tableID = reader.uint32();
      const columnID = reader.int16();
      const dataTypeID = reader.uint32();
      const dataTypeSize = reader.int16();
      const dataTypeModifier = reader.int32();
      const mode = reader.int16() === 0 ? "text" : "binary";
      return new messages_1.Field(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, mode);
    };
    var parseParameterDescriptionMessage = (reader) => {
      const parameterCount = reader.int16();
      const message = new messages_1.ParameterDescriptionMessage(LATEINIT_LENGTH, parameterCount);
      for (let i = 0; i < parameterCount; i++) {
        message.dataTypeIDs[i] = reader.int32();
      }
      return message;
    };
    var parseDataRowMessage = (reader) => {
      const fieldCount = reader.int16();
      const fields = new Array(fieldCount);
      for (let i = 0; i < fieldCount; i++) {
        const len = reader.int32();
        fields[i] = len === -1 ? null : reader.string(len);
      }
      return new messages_1.DataRowMessage(LATEINIT_LENGTH, fields);
    };
    var parseParameterStatusMessage = (reader) => {
      const name = reader.cstring();
      const value = reader.cstring();
      return new messages_1.ParameterStatusMessage(LATEINIT_LENGTH, name, value);
    };
    var parseBackendKeyData = (reader) => {
      const processID = reader.int32();
      const secretKey = reader.int32();
      return new messages_1.BackendKeyDataMessage(LATEINIT_LENGTH, processID, secretKey);
    };
    var parseAuthenticationResponse = (reader, length) => {
      const code = reader.int32();
      const message = {
        name: "authenticationOk",
        length
      };
      switch (code) {
        case 0:
          break;
        case 3:
          if (message.length === 8) {
            message.name = "authenticationCleartextPassword";
          }
          break;
        case 5:
          if (message.length === 12) {
            message.name = "authenticationMD5Password";
            const salt = reader.bytes(4);
            return new messages_1.AuthenticationMD5Password(LATEINIT_LENGTH, salt);
          }
          break;
        case 10:
          {
            message.name = "authenticationSASL";
            message.mechanisms = [];
            let mechanism;
            do {
              mechanism = reader.cstring();
              if (mechanism) {
                message.mechanisms.push(mechanism);
              }
            } while (mechanism);
          }
          break;
        case 11:
          message.name = "authenticationSASLContinue";
          message.data = reader.string(length - 8);
          break;
        case 12:
          message.name = "authenticationSASLFinal";
          message.data = reader.string(length - 8);
          break;
        default:
          throw new Error("Unknown authenticationOk message type " + code);
      }
      return message;
    };
    var parseErrorMessage = (reader, name) => {
      const fields = {};
      let fieldType = reader.string(1);
      while (fieldType !== "\0") {
        fields[fieldType] = reader.cstring();
        fieldType = reader.string(1);
      }
      const messageValue = fields.M;
      const message = name === "notice" ? new messages_1.NoticeMessage(LATEINIT_LENGTH, messageValue) : new messages_1.DatabaseError(messageValue, LATEINIT_LENGTH, name);
      message.severity = fields.S;
      message.code = fields.C;
      message.detail = fields.D;
      message.hint = fields.H;
      message.position = fields.P;
      message.internalPosition = fields.p;
      message.internalQuery = fields.q;
      message.where = fields.W;
      message.schema = fields.s;
      message.table = fields.t;
      message.column = fields.c;
      message.dataType = fields.d;
      message.constraint = fields.n;
      message.file = fields.F;
      message.line = fields.L;
      message.routine = fields.R;
      return message;
    };
  }
});

// node_modules/pg-protocol/dist/index.js
var require_dist = __commonJS({
  "node_modules/pg-protocol/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DatabaseError = exports2.serialize = exports2.parse = void 0;
    var messages_1 = require_messages();
    Object.defineProperty(exports2, "DatabaseError", { enumerable: true, get: function() {
      return messages_1.DatabaseError;
    } });
    var serializer_1 = require_serializer();
    Object.defineProperty(exports2, "serialize", { enumerable: true, get: function() {
      return serializer_1.serialize;
    } });
    var parser_1 = require_parser();
    function parse(stream, callback) {
      const parser = new parser_1.Parser();
      stream.on("data", (buffer) => parser.parse(buffer, callback));
      return new Promise((resolve) => stream.on("end", () => resolve()));
    }
    exports2.parse = parse;
  }
});

// node_modules/pg-cloudflare/dist/empty.js
var require_empty = __commonJS({
  "node_modules/pg-cloudflare/dist/empty.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = {};
  }
});

// node_modules/pg/lib/stream.js
var require_stream = __commonJS({
  "node_modules/pg/lib/stream.js"(exports2, module2) {
    var { getStream, getSecureStream } = getStreamFuncs();
    module2.exports = {
      /**
       * Get a socket stream compatible with the current runtime environment.
       * @returns {Duplex}
       */
      getStream,
      /**
       * Get a TLS secured socket, compatible with the current environment,
       * using the socket and other settings given in `options`.
       * @returns {Duplex}
       */
      getSecureStream
    };
    function getNodejsStreamFuncs() {
      function getStream2(ssl) {
        const net = require("net");
        return new net.Socket();
      }
      function getSecureStream2(options) {
        const tls = require("tls");
        return tls.connect(options);
      }
      return {
        getStream: getStream2,
        getSecureStream: getSecureStream2
      };
    }
    function getCloudflareStreamFuncs() {
      function getStream2(ssl) {
        const { CloudflareSocket } = require_empty();
        return new CloudflareSocket(ssl);
      }
      function getSecureStream2(options) {
        options.socket.startTls(options);
        return options.socket;
      }
      return {
        getStream: getStream2,
        getSecureStream: getSecureStream2
      };
    }
    function isCloudflareRuntime() {
      if (typeof navigator === "object" && navigator !== null && typeof navigator.userAgent === "string") {
        return navigator.userAgent === "Cloudflare-Workers";
      }
      if (typeof Response === "function") {
        const resp = new Response(null, { cf: { thing: true } });
        if (typeof resp.cf === "object" && resp.cf !== null && resp.cf.thing) {
          return true;
        }
      }
      return false;
    }
    function getStreamFuncs() {
      if (isCloudflareRuntime()) {
        return getCloudflareStreamFuncs();
      }
      return getNodejsStreamFuncs();
    }
  }
});

// node_modules/pg/lib/connection.js
var require_connection = __commonJS({
  "node_modules/pg/lib/connection.js"(exports2, module2) {
    "use strict";
    var EventEmitter4 = require("events").EventEmitter;
    var { parse, serialize } = require_dist();
    var { getStream, getSecureStream } = require_stream();
    var flushBuffer = serialize.flush();
    var syncBuffer = serialize.sync();
    var endBuffer = serialize.end();
    var Connection2 = class extends EventEmitter4 {
      constructor(config) {
        super();
        config = config || {};
        this.stream = config.stream || getStream(config.ssl);
        if (typeof this.stream === "function") {
          this.stream = this.stream(config);
        }
        this._keepAlive = config.keepAlive;
        this._keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis;
        this.parsedStatements = {};
        this.ssl = config.ssl || false;
        this._ending = false;
        this._emitMessage = false;
        const self = this;
        this.on("newListener", function(eventName) {
          if (eventName === "message") {
            self._emitMessage = true;
          }
        });
      }
      connect(port, host) {
        const self = this;
        this._connecting = true;
        this.stream.setNoDelay(true);
        this.stream.connect(port, host);
        this.stream.once("connect", function() {
          if (self._keepAlive) {
            self.stream.setKeepAlive(true, self._keepAliveInitialDelayMillis);
          }
          self.emit("connect");
        });
        const reportStreamError = function(error) {
          if (self._ending && (error.code === "ECONNRESET" || error.code === "EPIPE")) {
            return;
          }
          self.emit("error", error);
        };
        this.stream.on("error", reportStreamError);
        this.stream.on("close", function() {
          self.emit("end");
        });
        if (!this.ssl) {
          return this.attachListeners(this.stream);
        }
        this.stream.once("data", function(buffer) {
          const responseCode = buffer.toString("utf8");
          switch (responseCode) {
            case "S":
              break;
            case "N":
              self.stream.end();
              return self.emit("error", new Error("The server does not support SSL connections"));
            default:
              self.stream.end();
              return self.emit("error", new Error("There was an error establishing an SSL connection"));
          }
          const options = {
            socket: self.stream
          };
          if (self.ssl !== true) {
            Object.assign(options, self.ssl);
            if ("key" in self.ssl) {
              options.key = self.ssl.key;
            }
          }
          const net = require("net");
          if (net.isIP && net.isIP(host) === 0) {
            options.servername = host;
          }
          try {
            self.stream = getSecureStream(options);
          } catch (err) {
            return self.emit("error", err);
          }
          self.attachListeners(self.stream);
          self.stream.on("error", reportStreamError);
          self.emit("sslconnect");
        });
      }
      attachListeners(stream) {
        parse(stream, (msg) => {
          const eventName = msg.name === "error" ? "errorMessage" : msg.name;
          if (this._emitMessage) {
            this.emit("message", msg);
          }
          this.emit(eventName, msg);
        });
      }
      requestSsl() {
        this.stream.write(serialize.requestSsl());
      }
      startup(config) {
        this.stream.write(serialize.startup(config));
      }
      cancel(processID, secretKey) {
        this._send(serialize.cancel(processID, secretKey));
      }
      password(password) {
        this._send(serialize.password(password));
      }
      sendSASLInitialResponseMessage(mechanism, initialResponse) {
        this._send(serialize.sendSASLInitialResponseMessage(mechanism, initialResponse));
      }
      sendSCRAMClientFinalMessage(additionalData) {
        this._send(serialize.sendSCRAMClientFinalMessage(additionalData));
      }
      _send(buffer) {
        if (!this.stream.writable) {
          return false;
        }
        return this.stream.write(buffer);
      }
      query(text) {
        this._send(serialize.query(text));
      }
      // send parse message
      parse(query) {
        this._send(serialize.parse(query));
      }
      // send bind message
      bind(config) {
        this._send(serialize.bind(config));
      }
      // send execute message
      execute(config) {
        this._send(serialize.execute(config));
      }
      flush() {
        if (this.stream.writable) {
          this.stream.write(flushBuffer);
        }
      }
      sync() {
        this._ending = true;
        this._send(syncBuffer);
      }
      ref() {
        this.stream.ref();
      }
      unref() {
        this.stream.unref();
      }
      end() {
        this._ending = true;
        if (!this._connecting || !this.stream.writable) {
          this.stream.end();
          return;
        }
        return this.stream.write(endBuffer, () => {
          this.stream.end();
        });
      }
      close(msg) {
        this._send(serialize.close(msg));
      }
      describe(msg) {
        this._send(serialize.describe(msg));
      }
      sendCopyFromChunk(chunk) {
        this._send(serialize.copyData(chunk));
      }
      endCopyFrom() {
        this._send(serialize.copyDone());
      }
      sendCopyFail(msg) {
        this._send(serialize.copyFail(msg));
      }
    };
    module2.exports = Connection2;
  }
});

// node_modules/split2/index.js
var require_split2 = __commonJS({
  "node_modules/split2/index.js"(exports2, module2) {
    "use strict";
    var { Transform } = require("stream");
    var { StringDecoder } = require("string_decoder");
    var kLast = Symbol("last");
    var kDecoder = Symbol("decoder");
    function transform(chunk, enc, cb) {
      let list;
      if (this.overflow) {
        const buf = this[kDecoder].write(chunk);
        list = buf.split(this.matcher);
        if (list.length === 1) return cb();
        list.shift();
        this.overflow = false;
      } else {
        this[kLast] += this[kDecoder].write(chunk);
        list = this[kLast].split(this.matcher);
      }
      this[kLast] = list.pop();
      for (let i = 0; i < list.length; i++) {
        try {
          push(this, this.mapper(list[i]));
        } catch (error) {
          return cb(error);
        }
      }
      this.overflow = this[kLast].length > this.maxLength;
      if (this.overflow && !this.skipOverflow) {
        cb(new Error("maximum buffer reached"));
        return;
      }
      cb();
    }
    function flush(cb) {
      this[kLast] += this[kDecoder].end();
      if (this[kLast]) {
        try {
          push(this, this.mapper(this[kLast]));
        } catch (error) {
          return cb(error);
        }
      }
      cb();
    }
    function push(self, val) {
      if (val !== void 0) {
        self.push(val);
      }
    }
    function noop(incoming) {
      return incoming;
    }
    function split(matcher, mapper, options) {
      matcher = matcher || /\r?\n/;
      mapper = mapper || noop;
      options = options || {};
      switch (arguments.length) {
        case 1:
          if (typeof matcher === "function") {
            mapper = matcher;
            matcher = /\r?\n/;
          } else if (typeof matcher === "object" && !(matcher instanceof RegExp) && !matcher[Symbol.split]) {
            options = matcher;
            matcher = /\r?\n/;
          }
          break;
        case 2:
          if (typeof matcher === "function") {
            options = mapper;
            mapper = matcher;
            matcher = /\r?\n/;
          } else if (typeof mapper === "object") {
            options = mapper;
            mapper = noop;
          }
      }
      options = Object.assign({}, options);
      options.autoDestroy = true;
      options.transform = transform;
      options.flush = flush;
      options.readableObjectMode = true;
      const stream = new Transform(options);
      stream[kLast] = "";
      stream[kDecoder] = new StringDecoder("utf8");
      stream.matcher = matcher;
      stream.mapper = mapper;
      stream.maxLength = options.maxLength;
      stream.skipOverflow = options.skipOverflow || false;
      stream.overflow = false;
      stream._destroy = function(err, cb) {
        this._writableState.errorEmitted = false;
        cb(err);
      };
      return stream;
    }
    module2.exports = split;
  }
});

// node_modules/pgpass/lib/helper.js
var require_helper = __commonJS({
  "node_modules/pgpass/lib/helper.js"(exports2, module2) {
    "use strict";
    var path = require("path");
    var Stream = require("stream").Stream;
    var split = require_split2();
    var util = require("util");
    var defaultPort = 5432;
    var isWin = process.platform === "win32";
    var warnStream = process.stderr;
    var S_IRWXG = 56;
    var S_IRWXO = 7;
    var S_IFMT = 61440;
    var S_IFREG = 32768;
    function isRegFile(mode) {
      return (mode & S_IFMT) == S_IFREG;
    }
    var fieldNames = ["host", "port", "database", "user", "password"];
    var nrOfFields = fieldNames.length;
    var passKey = fieldNames[nrOfFields - 1];
    function warn() {
      var isWritable = warnStream instanceof Stream && true === warnStream.writable;
      if (isWritable) {
        var args = Array.prototype.slice.call(arguments).concat("\n");
        warnStream.write(util.format.apply(util, args));
      }
    }
    Object.defineProperty(module2.exports, "isWin", {
      get: function() {
        return isWin;
      },
      set: function(val) {
        isWin = val;
      }
    });
    module2.exports.warnTo = function(stream) {
      var old = warnStream;
      warnStream = stream;
      return old;
    };
    module2.exports.getFileName = function(rawEnv) {
      var env6 = rawEnv || process.env;
      var file = env6.PGPASSFILE || (isWin ? path.join(env6.APPDATA || "./", "postgresql", "pgpass.conf") : path.join(env6.HOME || "./", ".pgpass"));
      return file;
    };
    module2.exports.usePgPass = function(stats, fname) {
      if (Object.prototype.hasOwnProperty.call(process.env, "PGPASSWORD")) {
        return false;
      }
      if (isWin) {
        return true;
      }
      fname = fname || "<unkn>";
      if (!isRegFile(stats.mode)) {
        warn('WARNING: password file "%s" is not a plain file', fname);
        return false;
      }
      if (stats.mode & (S_IRWXG | S_IRWXO)) {
        warn('WARNING: password file "%s" has group or world access; permissions should be u=rw (0600) or less', fname);
        return false;
      }
      return true;
    };
    var matcher = module2.exports.match = function(connInfo, entry) {
      return fieldNames.slice(0, -1).reduce(function(prev, field, idx) {
        if (idx == 1) {
          if (Number(connInfo[field] || defaultPort) === Number(entry[field])) {
            return prev && true;
          }
        }
        return prev && (entry[field] === "*" || entry[field] === connInfo[field]);
      }, true);
    };
    module2.exports.getPassword = function(connInfo, stream, cb) {
      var pass;
      var lineStream = stream.pipe(split());
      function onLine(line) {
        var entry = parseLine(line);
        if (entry && isValidEntry(entry) && matcher(connInfo, entry)) {
          pass = entry[passKey];
          lineStream.end();
        }
      }
      var onEnd = function() {
        stream.destroy();
        cb(pass);
      };
      var onErr = function(err) {
        stream.destroy();
        warn("WARNING: error on reading file: %s", err);
        cb(void 0);
      };
      stream.on("error", onErr);
      lineStream.on("data", onLine).on("end", onEnd).on("error", onErr);
    };
    var parseLine = module2.exports.parseLine = function(line) {
      if (line.length < 11 || line.match(/^\s+#/)) {
        return null;
      }
      var curChar = "";
      var prevChar = "";
      var fieldIdx = 0;
      var startIdx = 0;
      var endIdx = 0;
      var obj = {};
      var isLastField = false;
      var addToObj = function(idx, i0, i1) {
        var field = line.substring(i0, i1);
        if (!Object.hasOwnProperty.call(process.env, "PGPASS_NO_DEESCAPE")) {
          field = field.replace(/\\([:\\])/g, "$1");
        }
        obj[fieldNames[idx]] = field;
      };
      for (var i = 0; i < line.length - 1; i += 1) {
        curChar = line.charAt(i + 1);
        prevChar = line.charAt(i);
        isLastField = fieldIdx == nrOfFields - 1;
        if (isLastField) {
          addToObj(fieldIdx, startIdx);
          break;
        }
        if (i >= 0 && curChar == ":" && prevChar !== "\\") {
          addToObj(fieldIdx, startIdx, i + 1);
          startIdx = i + 2;
          fieldIdx += 1;
        }
      }
      obj = Object.keys(obj).length === nrOfFields ? obj : null;
      return obj;
    };
    var isValidEntry = module2.exports.isValidEntry = function(entry) {
      var rules = {
        // host
        0: function(x) {
          return x.length > 0;
        },
        // port
        1: function(x) {
          if (x === "*") {
            return true;
          }
          x = Number(x);
          return isFinite(x) && x > 0 && x < 9007199254740992 && Math.floor(x) === x;
        },
        // database
        2: function(x) {
          return x.length > 0;
        },
        // username
        3: function(x) {
          return x.length > 0;
        },
        // password
        4: function(x) {
          return x.length > 0;
        }
      };
      for (var idx = 0; idx < fieldNames.length; idx += 1) {
        var rule = rules[idx];
        var value = entry[fieldNames[idx]] || "";
        var res = rule(value);
        if (!res) {
          return false;
        }
      }
      return true;
    };
  }
});

// node_modules/pgpass/lib/index.js
var require_lib = __commonJS({
  "node_modules/pgpass/lib/index.js"(exports2, module2) {
    "use strict";
    var path = require("path");
    var fs = require("fs");
    var helper = require_helper();
    module2.exports = function(connInfo, cb) {
      var file = helper.getFileName();
      fs.stat(file, function(err, stat) {
        if (err || !helper.usePgPass(stat, file)) {
          return cb(void 0);
        }
        var st = fs.createReadStream(file);
        helper.getPassword(connInfo, st, cb);
      });
    };
    module2.exports.warnTo = helper.warnTo;
  }
});

// node_modules/pg/lib/client.js
var require_client = __commonJS({
  "node_modules/pg/lib/client.js"(exports2, module2) {
    var EventEmitter4 = require("events").EventEmitter;
    var utils = require_utils();
    var nodeUtils = require("util");
    var sasl = require_sasl();
    var TypeOverrides2 = require_type_overrides();
    var ConnectionParameters = require_connection_parameters();
    var Query2 = require_query();
    var defaults2 = require_defaults();
    var Connection2 = require_connection();
    var crypto2 = require_utils2();
    var activeQueryDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Client.activeQuery is deprecated and will be removed in pg@9.0"
    );
    var queryQueueDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Client.queryQueue is deprecated and will be removed in pg@9.0."
    );
    var pgPassDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "pgpass support is deprecated and will be removed in pg@9.0. You can provide an async function as the password property to the Client/Pool constructor that returns a password instead. Within this function you can call the pgpass module in your own code."
    );
    var byoPromiseDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Passing a custom Promise implementation to the Client/Pool constructor is deprecated and will be removed in pg@9.0."
    );
    var queryQueueLengthDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead."
    );
    var Client2 = class extends EventEmitter4 {
      constructor(config) {
        super();
        this.connectionParameters = new ConnectionParameters(config);
        this.user = this.connectionParameters.user;
        this.database = this.connectionParameters.database;
        this.port = this.connectionParameters.port;
        this.host = this.connectionParameters.host;
        Object.defineProperty(this, "password", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: this.connectionParameters.password
        });
        this.replication = this.connectionParameters.replication;
        const c = config || {};
        if (c.Promise) {
          byoPromiseDeprecationNotice();
        }
        this._Promise = c.Promise || global.Promise;
        this._types = new TypeOverrides2(c.types);
        this._ending = false;
        this._ended = false;
        this._connecting = false;
        this._connected = false;
        this._connectionError = false;
        this._queryable = true;
        this._activeQuery = null;
        this.enableChannelBinding = Boolean(c.enableChannelBinding);
        this.connection = c.connection || new Connection2({
          stream: c.stream,
          ssl: this.connectionParameters.ssl,
          keepAlive: c.keepAlive || false,
          keepAliveInitialDelayMillis: c.keepAliveInitialDelayMillis || 0,
          encoding: this.connectionParameters.client_encoding || "utf8"
        });
        this._queryQueue = [];
        this.binary = c.binary || defaults2.binary;
        this.processID = null;
        this.secretKey = null;
        this.ssl = this.connectionParameters.ssl || false;
        if (this.ssl && this.ssl.key) {
          Object.defineProperty(this.ssl, "key", {
            enumerable: false
          });
        }
        this._connectionTimeoutMillis = c.connectionTimeoutMillis || 0;
      }
      get activeQuery() {
        activeQueryDeprecationNotice();
        return this._activeQuery;
      }
      set activeQuery(val) {
        activeQueryDeprecationNotice();
        this._activeQuery = val;
      }
      _getActiveQuery() {
        return this._activeQuery;
      }
      _errorAllQueries(err) {
        const enqueueError = (query) => {
          process.nextTick(() => {
            query.handleError(err, this.connection);
          });
        };
        const activeQuery = this._getActiveQuery();
        if (activeQuery) {
          enqueueError(activeQuery);
          this._activeQuery = null;
        }
        this._queryQueue.forEach(enqueueError);
        this._queryQueue.length = 0;
      }
      _connect(callback) {
        const self = this;
        const con = this.connection;
        this._connectionCallback = callback;
        if (this._connecting || this._connected) {
          const err = new Error("Client has already been connected. You cannot reuse a client.");
          process.nextTick(() => {
            callback(err);
          });
          return;
        }
        this._connecting = true;
        if (this._connectionTimeoutMillis > 0) {
          this.connectionTimeoutHandle = setTimeout(() => {
            con._ending = true;
            con.stream.destroy(new Error("timeout expired"));
          }, this._connectionTimeoutMillis);
          if (this.connectionTimeoutHandle.unref) {
            this.connectionTimeoutHandle.unref();
          }
        }
        if (this.host && this.host.indexOf("/") === 0) {
          con.connect(this.host + "/.s.PGSQL." + this.port);
        } else {
          con.connect(this.port, this.host);
        }
        con.on("connect", function() {
          if (self.ssl) {
            con.requestSsl();
          } else {
            con.startup(self.getStartupConf());
          }
        });
        con.on("sslconnect", function() {
          con.startup(self.getStartupConf());
        });
        this._attachListeners(con);
        con.once("end", () => {
          const error = this._ending ? new Error("Connection terminated") : new Error("Connection terminated unexpectedly");
          clearTimeout(this.connectionTimeoutHandle);
          this._errorAllQueries(error);
          this._ended = true;
          if (!this._ending) {
            if (this._connecting && !this._connectionError) {
              if (this._connectionCallback) {
                this._connectionCallback(error);
              } else {
                this._handleErrorEvent(error);
              }
            } else if (!this._connectionError) {
              this._handleErrorEvent(error);
            }
          }
          process.nextTick(() => {
            this.emit("end");
          });
        });
      }
      connect(callback) {
        if (callback) {
          this._connect(callback);
          return;
        }
        return new this._Promise((resolve, reject) => {
          this._connect((error) => {
            if (error) {
              reject(error);
            } else {
              resolve(this);
            }
          });
        });
      }
      _attachListeners(con) {
        con.on("authenticationCleartextPassword", this._handleAuthCleartextPassword.bind(this));
        con.on("authenticationMD5Password", this._handleAuthMD5Password.bind(this));
        con.on("authenticationSASL", this._handleAuthSASL.bind(this));
        con.on("authenticationSASLContinue", this._handleAuthSASLContinue.bind(this));
        con.on("authenticationSASLFinal", this._handleAuthSASLFinal.bind(this));
        con.on("backendKeyData", this._handleBackendKeyData.bind(this));
        con.on("error", this._handleErrorEvent.bind(this));
        con.on("errorMessage", this._handleErrorMessage.bind(this));
        con.on("readyForQuery", this._handleReadyForQuery.bind(this));
        con.on("notice", this._handleNotice.bind(this));
        con.on("rowDescription", this._handleRowDescription.bind(this));
        con.on("dataRow", this._handleDataRow.bind(this));
        con.on("portalSuspended", this._handlePortalSuspended.bind(this));
        con.on("emptyQuery", this._handleEmptyQuery.bind(this));
        con.on("commandComplete", this._handleCommandComplete.bind(this));
        con.on("parseComplete", this._handleParseComplete.bind(this));
        con.on("copyInResponse", this._handleCopyInResponse.bind(this));
        con.on("copyData", this._handleCopyData.bind(this));
        con.on("notification", this._handleNotification.bind(this));
      }
      _getPassword(cb) {
        const con = this.connection;
        if (typeof this.password === "function") {
          this._Promise.resolve().then(() => this.password(this.connectionParameters)).then((pass) => {
            if (pass !== void 0) {
              if (typeof pass !== "string") {
                con.emit("error", new TypeError("Password must be a string"));
                return;
              }
              this.connectionParameters.password = this.password = pass;
            } else {
              this.connectionParameters.password = this.password = null;
            }
            cb();
          }).catch((err) => {
            con.emit("error", err);
          });
        } else if (this.password !== null) {
          cb();
        } else {
          try {
            const pgPass = require_lib();
            pgPass(this.connectionParameters, (pass) => {
              if (void 0 !== pass) {
                pgPassDeprecationNotice();
                this.connectionParameters.password = this.password = pass;
              }
              cb();
            });
          } catch (e) {
            this.emit("error", e);
          }
        }
      }
      _handleAuthCleartextPassword(msg) {
        this._getPassword(() => {
          this.connection.password(this.password);
        });
      }
      _handleAuthMD5Password(msg) {
        this._getPassword(async () => {
          try {
            const hashedPassword = await crypto2.postgresMd5PasswordHash(this.user, this.password, msg.salt);
            this.connection.password(hashedPassword);
          } catch (e) {
            this.emit("error", e);
          }
        });
      }
      _handleAuthSASL(msg) {
        this._getPassword(() => {
          try {
            this.saslSession = sasl.startSession(msg.mechanisms, this.enableChannelBinding && this.connection.stream);
            this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism, this.saslSession.response);
          } catch (err) {
            this.connection.emit("error", err);
          }
        });
      }
      async _handleAuthSASLContinue(msg) {
        try {
          await sasl.continueSession(
            this.saslSession,
            this.password,
            msg.data,
            this.enableChannelBinding && this.connection.stream
          );
          this.connection.sendSCRAMClientFinalMessage(this.saslSession.response);
        } catch (err) {
          this.connection.emit("error", err);
        }
      }
      _handleAuthSASLFinal(msg) {
        try {
          sasl.finalizeSession(this.saslSession, msg.data);
          this.saslSession = null;
        } catch (err) {
          this.connection.emit("error", err);
        }
      }
      _handleBackendKeyData(msg) {
        this.processID = msg.processID;
        this.secretKey = msg.secretKey;
      }
      _handleReadyForQuery(msg) {
        if (this._connecting) {
          this._connecting = false;
          this._connected = true;
          clearTimeout(this.connectionTimeoutHandle);
          if (this._connectionCallback) {
            this._connectionCallback(null, this);
            this._connectionCallback = null;
          }
          this.emit("connect");
        }
        const activeQuery = this._getActiveQuery();
        this._activeQuery = null;
        this.readyForQuery = true;
        if (activeQuery) {
          activeQuery.handleReadyForQuery(this.connection);
        }
        this._pulseQueryQueue();
      }
      // if we receive an error event or error message
      // during the connection process we handle it here
      _handleErrorWhileConnecting(err) {
        if (this._connectionError) {
          return;
        }
        this._connectionError = true;
        clearTimeout(this.connectionTimeoutHandle);
        if (this._connectionCallback) {
          return this._connectionCallback(err);
        }
        this.emit("error", err);
      }
      // if we're connected and we receive an error event from the connection
      // this means the socket is dead - do a hard abort of all queries and emit
      // the socket error on the client as well
      _handleErrorEvent(err) {
        if (this._connecting) {
          return this._handleErrorWhileConnecting(err);
        }
        this._queryable = false;
        this._errorAllQueries(err);
        this.emit("error", err);
      }
      // handle error messages from the postgres backend
      _handleErrorMessage(msg) {
        if (this._connecting) {
          return this._handleErrorWhileConnecting(msg);
        }
        const activeQuery = this._getActiveQuery();
        if (!activeQuery) {
          this._handleErrorEvent(msg);
          return;
        }
        this._activeQuery = null;
        activeQuery.handleError(msg, this.connection);
      }
      _handleRowDescription(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected rowDescription message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleRowDescription(msg);
      }
      _handleDataRow(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected dataRow message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleDataRow(msg);
      }
      _handlePortalSuspended(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected portalSuspended message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handlePortalSuspended(this.connection);
      }
      _handleEmptyQuery(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected emptyQuery message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleEmptyQuery(this.connection);
      }
      _handleCommandComplete(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected commandComplete message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleCommandComplete(msg, this.connection);
      }
      _handleParseComplete() {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected parseComplete message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        if (activeQuery.name) {
          this.connection.parsedStatements[activeQuery.name] = activeQuery.text;
        }
      }
      _handleCopyInResponse(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected copyInResponse message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleCopyInResponse(this.connection);
      }
      _handleCopyData(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected copyData message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleCopyData(msg, this.connection);
      }
      _handleNotification(msg) {
        this.emit("notification", msg);
      }
      _handleNotice(msg) {
        this.emit("notice", msg);
      }
      getStartupConf() {
        const params = this.connectionParameters;
        const data = {
          user: params.user,
          database: params.database
        };
        const appName = params.application_name || params.fallback_application_name;
        if (appName) {
          data.application_name = appName;
        }
        if (params.replication) {
          data.replication = "" + params.replication;
        }
        if (params.statement_timeout) {
          data.statement_timeout = String(parseInt(params.statement_timeout, 10));
        }
        if (params.lock_timeout) {
          data.lock_timeout = String(parseInt(params.lock_timeout, 10));
        }
        if (params.idle_in_transaction_session_timeout) {
          data.idle_in_transaction_session_timeout = String(parseInt(params.idle_in_transaction_session_timeout, 10));
        }
        if (params.options) {
          data.options = params.options;
        }
        return data;
      }
      cancel(client, query) {
        if (client.activeQuery === query) {
          const con = this.connection;
          if (this.host && this.host.indexOf("/") === 0) {
            con.connect(this.host + "/.s.PGSQL." + this.port);
          } else {
            con.connect(this.port, this.host);
          }
          con.on("connect", function() {
            con.cancel(client.processID, client.secretKey);
          });
        } else if (client._queryQueue.indexOf(query) !== -1) {
          client._queryQueue.splice(client._queryQueue.indexOf(query), 1);
        }
      }
      setTypeParser(oid, format, parseFn) {
        return this._types.setTypeParser(oid, format, parseFn);
      }
      getTypeParser(oid, format) {
        return this._types.getTypeParser(oid, format);
      }
      // escapeIdentifier and escapeLiteral moved to utility functions & exported
      // on PG
      // re-exported here for backwards compatibility
      escapeIdentifier(str) {
        return utils.escapeIdentifier(str);
      }
      escapeLiteral(str) {
        return utils.escapeLiteral(str);
      }
      _pulseQueryQueue() {
        if (this.readyForQuery === true) {
          this._activeQuery = this._queryQueue.shift();
          const activeQuery = this._getActiveQuery();
          if (activeQuery) {
            this.readyForQuery = false;
            this.hasExecuted = true;
            const queryError = activeQuery.submit(this.connection);
            if (queryError) {
              process.nextTick(() => {
                activeQuery.handleError(queryError, this.connection);
                this.readyForQuery = true;
                this._pulseQueryQueue();
              });
            }
          } else if (this.hasExecuted) {
            this._activeQuery = null;
            this.emit("drain");
          }
        }
      }
      query(config, values, callback) {
        let query;
        let result;
        let readTimeout;
        let readTimeoutTimer;
        let queryCallback;
        if (config === null || config === void 0) {
          throw new TypeError("Client was passed a null or undefined query");
        } else if (typeof config.submit === "function") {
          readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
          result = query = config;
          if (!query.callback) {
            if (typeof values === "function") {
              query.callback = values;
            } else if (callback) {
              query.callback = callback;
            }
          }
        } else {
          readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
          query = new Query2(config, values, callback);
          if (!query.callback) {
            result = new this._Promise((resolve, reject) => {
              query.callback = (err, res) => err ? reject(err) : resolve(res);
            }).catch((err) => {
              Error.captureStackTrace(err);
              throw err;
            });
          }
        }
        if (readTimeout) {
          queryCallback = query.callback || (() => {
          });
          readTimeoutTimer = setTimeout(() => {
            const error = new Error("Query read timeout");
            process.nextTick(() => {
              query.handleError(error, this.connection);
            });
            queryCallback(error);
            query.callback = () => {
            };
            const index = this._queryQueue.indexOf(query);
            if (index > -1) {
              this._queryQueue.splice(index, 1);
            }
            this._pulseQueryQueue();
          }, readTimeout);
          query.callback = (err, res) => {
            clearTimeout(readTimeoutTimer);
            queryCallback(err, res);
          };
        }
        if (this.binary && !query.binary) {
          query.binary = true;
        }
        if (query._result && !query._result._types) {
          query._result._types = this._types;
        }
        if (!this._queryable) {
          process.nextTick(() => {
            query.handleError(new Error("Client has encountered a connection error and is not queryable"), this.connection);
          });
          return result;
        }
        if (this._ending) {
          process.nextTick(() => {
            query.handleError(new Error("Client was closed and is not queryable"), this.connection);
          });
          return result;
        }
        if (this._queryQueue.length > 0) {
          queryQueueLengthDeprecationNotice();
        }
        this._queryQueue.push(query);
        this._pulseQueryQueue();
        return result;
      }
      ref() {
        this.connection.ref();
      }
      unref() {
        this.connection.unref();
      }
      end(cb) {
        this._ending = true;
        if (!this.connection._connecting || this._ended) {
          if (cb) {
            cb();
          } else {
            return this._Promise.resolve();
          }
        }
        if (this._getActiveQuery() || !this._queryable) {
          this.connection.stream.destroy();
        } else {
          this.connection.end();
        }
        if (cb) {
          this.connection.once("end", cb);
        } else {
          return new this._Promise((resolve) => {
            this.connection.once("end", resolve);
          });
        }
      }
      get queryQueue() {
        queryQueueDeprecationNotice();
        return this._queryQueue;
      }
    };
    Client2.Query = Query2;
    module2.exports = Client2;
  }
});

// node_modules/pg-pool/index.js
var require_pg_pool = __commonJS({
  "node_modules/pg-pool/index.js"(exports2, module2) {
    "use strict";
    var EventEmitter4 = require("events").EventEmitter;
    var NOOP = function() {
    };
    var removeWhere = (list, predicate) => {
      const i = list.findIndex(predicate);
      return i === -1 ? void 0 : list.splice(i, 1)[0];
    };
    var IdleItem = class {
      constructor(client, idleListener, timeoutId) {
        this.client = client;
        this.idleListener = idleListener;
        this.timeoutId = timeoutId;
      }
    };
    var PendingItem = class {
      constructor(callback) {
        this.callback = callback;
      }
    };
    function throwOnDoubleRelease() {
      throw new Error("Release called on client which has already been released to the pool.");
    }
    function promisify(Promise2, callback) {
      if (callback) {
        return { callback, result: void 0 };
      }
      let rej;
      let res;
      const cb = function(err, client) {
        err ? rej(err) : res(client);
      };
      const result = new Promise2(function(resolve, reject) {
        res = resolve;
        rej = reject;
      }).catch((err) => {
        Error.captureStackTrace(err);
        throw err;
      });
      return { callback: cb, result };
    }
    function makeIdleListener(pool, client) {
      return function idleListener(err) {
        err.client = client;
        client.removeListener("error", idleListener);
        client.on("error", () => {
          pool.log("additional client error after disconnection due to error", err);
        });
        pool._remove(client);
        pool.emit("error", err, client);
      };
    }
    var Pool2 = class extends EventEmitter4 {
      constructor(options, Client2) {
        super();
        this.options = Object.assign({}, options);
        if (options != null && "password" in options) {
          Object.defineProperty(this.options, "password", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: options.password
          });
        }
        if (options != null && options.ssl && options.ssl.key) {
          Object.defineProperty(this.options.ssl, "key", {
            enumerable: false
          });
        }
        this.options.max = this.options.max || this.options.poolSize || 10;
        this.options.min = this.options.min || 0;
        this.options.maxUses = this.options.maxUses || Infinity;
        this.options.allowExitOnIdle = this.options.allowExitOnIdle || false;
        this.options.maxLifetimeSeconds = this.options.maxLifetimeSeconds || 0;
        this.log = this.options.log || function() {
        };
        this.Client = this.options.Client || Client2 || require_lib2().Client;
        this.Promise = this.options.Promise || global.Promise;
        if (typeof this.options.idleTimeoutMillis === "undefined") {
          this.options.idleTimeoutMillis = 1e4;
        }
        this._clients = [];
        this._idle = [];
        this._expired = /* @__PURE__ */ new WeakSet();
        this._pendingQueue = [];
        this._endCallback = void 0;
        this.ending = false;
        this.ended = false;
      }
      _promiseTry(f) {
        const Promise2 = this.Promise;
        if (typeof Promise2.try === "function") {
          return Promise2.try(f);
        }
        return new Promise2((resolve) => resolve(f()));
      }
      _isFull() {
        return this._clients.length >= this.options.max;
      }
      _isAboveMin() {
        return this._clients.length > this.options.min;
      }
      _pulseQueue() {
        this.log("pulse queue");
        if (this.ended) {
          this.log("pulse queue ended");
          return;
        }
        if (this.ending) {
          this.log("pulse queue on ending");
          if (this._idle.length) {
            this._idle.slice().map((item) => {
              this._remove(item.client);
            });
          }
          if (!this._clients.length) {
            this.ended = true;
            this._endCallback();
          }
          return;
        }
        if (!this._pendingQueue.length) {
          this.log("no queued requests");
          return;
        }
        if (!this._idle.length && this._isFull()) {
          return;
        }
        const pendingItem = this._pendingQueue.shift();
        if (this._idle.length) {
          const idleItem = this._idle.pop();
          clearTimeout(idleItem.timeoutId);
          const client = idleItem.client;
          client.ref && client.ref();
          const idleListener = idleItem.idleListener;
          return this._acquireClient(client, pendingItem, idleListener, false);
        }
        if (!this._isFull()) {
          return this.newClient(pendingItem);
        }
        throw new Error("unexpected condition");
      }
      _remove(client, callback) {
        const removed = removeWhere(this._idle, (item) => item.client === client);
        if (removed !== void 0) {
          clearTimeout(removed.timeoutId);
        }
        this._clients = this._clients.filter((c) => c !== client);
        const context = this;
        client.end(() => {
          context.emit("remove", client);
          if (typeof callback === "function") {
            callback();
          }
        });
      }
      connect(cb) {
        if (this.ending) {
          const err = new Error("Cannot use a pool after calling end on the pool");
          return cb ? cb(err) : this.Promise.reject(err);
        }
        const response = promisify(this.Promise, cb);
        const result = response.result;
        if (this._isFull() || this._idle.length) {
          if (this._idle.length) {
            process.nextTick(() => this._pulseQueue());
          }
          if (!this.options.connectionTimeoutMillis) {
            this._pendingQueue.push(new PendingItem(response.callback));
            return result;
          }
          const queueCallback = (err, res, done) => {
            clearTimeout(tid);
            response.callback(err, res, done);
          };
          const pendingItem = new PendingItem(queueCallback);
          const tid = setTimeout(() => {
            removeWhere(this._pendingQueue, (i) => i.callback === queueCallback);
            pendingItem.timedOut = true;
            response.callback(new Error("timeout exceeded when trying to connect"));
          }, this.options.connectionTimeoutMillis);
          if (tid.unref) {
            tid.unref();
          }
          this._pendingQueue.push(pendingItem);
          return result;
        }
        this.newClient(new PendingItem(response.callback));
        return result;
      }
      newClient(pendingItem) {
        const client = new this.Client(this.options);
        this._clients.push(client);
        const idleListener = makeIdleListener(this, client);
        this.log("checking client timeout");
        let tid;
        let timeoutHit = false;
        if (this.options.connectionTimeoutMillis) {
          tid = setTimeout(() => {
            if (client.connection) {
              this.log("ending client due to timeout");
              timeoutHit = true;
              client.connection.stream.destroy();
            } else if (!client.isConnected()) {
              this.log("ending client due to timeout");
              timeoutHit = true;
              client.end();
            }
          }, this.options.connectionTimeoutMillis);
        }
        this.log("connecting new client");
        client.connect((err) => {
          if (tid) {
            clearTimeout(tid);
          }
          client.on("error", idleListener);
          if (err) {
            this.log("client failed to connect", err);
            this._clients = this._clients.filter((c) => c !== client);
            if (timeoutHit) {
              err = new Error("Connection terminated due to connection timeout", { cause: err });
            }
            this._pulseQueue();
            if (!pendingItem.timedOut) {
              pendingItem.callback(err, void 0, NOOP);
            }
          } else {
            this.log("new client connected");
            if (this.options.onConnect) {
              this._promiseTry(() => this.options.onConnect(client)).then(
                () => {
                  this._afterConnect(client, pendingItem, idleListener);
                },
                (hookErr) => {
                  this._clients = this._clients.filter((c) => c !== client);
                  client.end(() => {
                    this._pulseQueue();
                    if (!pendingItem.timedOut) {
                      pendingItem.callback(hookErr, void 0, NOOP);
                    }
                  });
                }
              );
              return;
            }
            return this._afterConnect(client, pendingItem, idleListener);
          }
        });
      }
      _afterConnect(client, pendingItem, idleListener) {
        if (this.options.maxLifetimeSeconds !== 0) {
          const maxLifetimeTimeout = setTimeout(() => {
            this.log("ending client due to expired lifetime");
            this._expired.add(client);
            const idleIndex = this._idle.findIndex((idleItem) => idleItem.client === client);
            if (idleIndex !== -1) {
              this._acquireClient(
                client,
                new PendingItem((err, client2, clientRelease) => clientRelease()),
                idleListener,
                false
              );
            }
          }, this.options.maxLifetimeSeconds * 1e3);
          maxLifetimeTimeout.unref();
          client.once("end", () => clearTimeout(maxLifetimeTimeout));
        }
        return this._acquireClient(client, pendingItem, idleListener, true);
      }
      // acquire a client for a pending work item
      _acquireClient(client, pendingItem, idleListener, isNew) {
        if (isNew) {
          this.emit("connect", client);
        }
        this.emit("acquire", client);
        client.release = this._releaseOnce(client, idleListener);
        client.removeListener("error", idleListener);
        if (!pendingItem.timedOut) {
          if (isNew && this.options.verify) {
            this.options.verify(client, (err) => {
              if (err) {
                client.release(err);
                return pendingItem.callback(err, void 0, NOOP);
              }
              pendingItem.callback(void 0, client, client.release);
            });
          } else {
            pendingItem.callback(void 0, client, client.release);
          }
        } else {
          if (isNew && this.options.verify) {
            this.options.verify(client, client.release);
          } else {
            client.release();
          }
        }
      }
      // returns a function that wraps _release and throws if called more than once
      _releaseOnce(client, idleListener) {
        let released = false;
        return (err) => {
          if (released) {
            throwOnDoubleRelease();
          }
          released = true;
          this._release(client, idleListener, err);
        };
      }
      // release a client back to the poll, include an error
      // to remove it from the pool
      _release(client, idleListener, err) {
        client.on("error", idleListener);
        client._poolUseCount = (client._poolUseCount || 0) + 1;
        this.emit("release", err, client);
        if (err || this.ending || !client._queryable || client._ending || client._poolUseCount >= this.options.maxUses) {
          if (client._poolUseCount >= this.options.maxUses) {
            this.log("remove expended client");
          }
          return this._remove(client, this._pulseQueue.bind(this));
        }
        const isExpired = this._expired.has(client);
        if (isExpired) {
          this.log("remove expired client");
          this._expired.delete(client);
          return this._remove(client, this._pulseQueue.bind(this));
        }
        let tid;
        if (this.options.idleTimeoutMillis && this._isAboveMin()) {
          tid = setTimeout(() => {
            if (this._isAboveMin()) {
              this.log("remove idle client");
              this._remove(client, this._pulseQueue.bind(this));
            }
          }, this.options.idleTimeoutMillis);
          if (this.options.allowExitOnIdle) {
            tid.unref();
          }
        }
        if (this.options.allowExitOnIdle) {
          client.unref();
        }
        this._idle.push(new IdleItem(client, idleListener, tid));
        this._pulseQueue();
      }
      query(text, values, cb) {
        if (typeof text === "function") {
          const response2 = promisify(this.Promise, text);
          setImmediate(function() {
            return response2.callback(new Error("Passing a function as the first parameter to pool.query is not supported"));
          });
          return response2.result;
        }
        if (typeof values === "function") {
          cb = values;
          values = void 0;
        }
        const response = promisify(this.Promise, cb);
        cb = response.callback;
        this.connect((err, client) => {
          if (err) {
            return cb(err);
          }
          let clientReleased = false;
          const onError = (err2) => {
            if (clientReleased) {
              return;
            }
            clientReleased = true;
            client.release(err2);
            cb(err2);
          };
          client.once("error", onError);
          this.log("dispatching query");
          try {
            client.query(text, values, (err2, res) => {
              this.log("query dispatched");
              client.removeListener("error", onError);
              if (clientReleased) {
                return;
              }
              clientReleased = true;
              client.release(err2);
              if (err2) {
                return cb(err2);
              }
              return cb(void 0, res);
            });
          } catch (err2) {
            client.release(err2);
            return cb(err2);
          }
        });
        return response.result;
      }
      end(cb) {
        this.log("ending");
        if (this.ending) {
          const err = new Error("Called end on pool more than once");
          return cb ? cb(err) : this.Promise.reject(err);
        }
        this.ending = true;
        const promised = promisify(this.Promise, cb);
        this._endCallback = promised.callback;
        this._pulseQueue();
        return promised.result;
      }
      get waitingCount() {
        return this._pendingQueue.length;
      }
      get idleCount() {
        return this._idle.length;
      }
      get expiredCount() {
        return this._clients.reduce((acc, client) => acc + (this._expired.has(client) ? 1 : 0), 0);
      }
      get totalCount() {
        return this._clients.length;
      }
    };
    module2.exports = Pool2;
  }
});

// node_modules/pg/lib/native/query.js
var require_query2 = __commonJS({
  "node_modules/pg/lib/native/query.js"(exports2, module2) {
    "use strict";
    var EventEmitter4 = require("events").EventEmitter;
    var util = require("util");
    var utils = require_utils();
    var NativeQuery = module2.exports = function(config, values, callback) {
      EventEmitter4.call(this);
      config = utils.normalizeQueryConfig(config, values, callback);
      this.text = config.text;
      this.values = config.values;
      this.name = config.name;
      this.queryMode = config.queryMode;
      this.callback = config.callback;
      this.state = "new";
      this._arrayMode = config.rowMode === "array";
      this._emitRowEvents = false;
      this.on(
        "newListener",
        function(event) {
          if (event === "row") this._emitRowEvents = true;
        }.bind(this)
      );
    };
    util.inherits(NativeQuery, EventEmitter4);
    var errorFieldMap = {
      sqlState: "code",
      statementPosition: "position",
      messagePrimary: "message",
      context: "where",
      schemaName: "schema",
      tableName: "table",
      columnName: "column",
      dataTypeName: "dataType",
      constraintName: "constraint",
      sourceFile: "file",
      sourceLine: "line",
      sourceFunction: "routine"
    };
    NativeQuery.prototype.handleError = function(err) {
      const fields = this.native.pq.resultErrorFields();
      if (fields) {
        for (const key in fields) {
          const normalizedFieldName = errorFieldMap[key] || key;
          err[normalizedFieldName] = fields[key];
        }
      }
      if (this.callback) {
        this.callback(err);
      } else {
        this.emit("error", err);
      }
      this.state = "error";
    };
    NativeQuery.prototype.then = function(onSuccess, onFailure) {
      return this._getPromise().then(onSuccess, onFailure);
    };
    NativeQuery.prototype.catch = function(callback) {
      return this._getPromise().catch(callback);
    };
    NativeQuery.prototype._getPromise = function() {
      if (this._promise) return this._promise;
      this._promise = new Promise(
        function(resolve, reject) {
          this._once("end", resolve);
          this._once("error", reject);
        }.bind(this)
      );
      return this._promise;
    };
    NativeQuery.prototype.submit = function(client) {
      this.state = "running";
      const self = this;
      this.native = client.native;
      client.native.arrayMode = this._arrayMode;
      let after = function(err, rows, results) {
        client.native.arrayMode = false;
        setImmediate(function() {
          self.emit("_done");
        });
        if (err) {
          return self.handleError(err);
        }
        if (self._emitRowEvents) {
          if (results.length > 1) {
            rows.forEach((rowOfRows, i) => {
              rowOfRows.forEach((row) => {
                self.emit("row", row, results[i]);
              });
            });
          } else {
            rows.forEach(function(row) {
              self.emit("row", row, results);
            });
          }
        }
        self.state = "end";
        self.emit("end", results);
        if (self.callback) {
          self.callback(null, results);
        }
      };
      if (process.domain) {
        after = process.domain.bind(after);
      }
      if (this.name) {
        if (this.name.length > 63) {
          console.error("Warning! Postgres only supports 63 characters for query names.");
          console.error("You supplied %s (%s)", this.name, this.name.length);
          console.error("This can cause conflicts and silent errors executing queries");
        }
        const values = (this.values || []).map(utils.prepareValue);
        if (client.namedQueries[this.name]) {
          if (this.text && client.namedQueries[this.name] !== this.text) {
            const err = new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
            return after(err);
          }
          return client.native.execute(this.name, values, after);
        }
        return client.native.prepare(this.name, this.text, values.length, function(err) {
          if (err) return after(err);
          client.namedQueries[self.name] = self.text;
          return self.native.execute(self.name, values, after);
        });
      } else if (this.values) {
        if (!Array.isArray(this.values)) {
          const err = new Error("Query values must be an array");
          return after(err);
        }
        const vals = this.values.map(utils.prepareValue);
        client.native.query(this.text, vals, after);
      } else if (this.queryMode === "extended") {
        client.native.query(this.text, [], after);
      } else {
        client.native.query(this.text, after);
      }
    };
  }
});

// node_modules/pg/lib/native/client.js
var require_client2 = __commonJS({
  "node_modules/pg/lib/native/client.js"(exports2, module2) {
    var nodeUtils = require("util");
    var Native;
    try {
      Native = require("pg-native");
    } catch (e) {
      throw e;
    }
    var TypeOverrides2 = require_type_overrides();
    var EventEmitter4 = require("events").EventEmitter;
    var util = require("util");
    var ConnectionParameters = require_connection_parameters();
    var NativeQuery = require_query2();
    var queryQueueLengthDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead."
    );
    var Client2 = module2.exports = function(config) {
      EventEmitter4.call(this);
      config = config || {};
      this._Promise = config.Promise || global.Promise;
      this._types = new TypeOverrides2(config.types);
      this.native = new Native({
        types: this._types
      });
      this._queryQueue = [];
      this._ending = false;
      this._connecting = false;
      this._connected = false;
      this._queryable = true;
      const cp = this.connectionParameters = new ConnectionParameters(config);
      if (config.nativeConnectionString) cp.nativeConnectionString = config.nativeConnectionString;
      this.user = cp.user;
      Object.defineProperty(this, "password", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: cp.password
      });
      this.database = cp.database;
      this.host = cp.host;
      this.port = cp.port;
      this.namedQueries = {};
    };
    Client2.Query = NativeQuery;
    util.inherits(Client2, EventEmitter4);
    Client2.prototype._errorAllQueries = function(err) {
      const enqueueError = (query) => {
        process.nextTick(() => {
          query.native = this.native;
          query.handleError(err);
        });
      };
      if (this._hasActiveQuery()) {
        enqueueError(this._activeQuery);
        this._activeQuery = null;
      }
      this._queryQueue.forEach(enqueueError);
      this._queryQueue.length = 0;
    };
    Client2.prototype._connect = function(cb) {
      const self = this;
      if (this._connecting) {
        process.nextTick(() => cb(new Error("Client has already been connected. You cannot reuse a client.")));
        return;
      }
      this._connecting = true;
      this.connectionParameters.getLibpqConnectionString(function(err, conString) {
        if (self.connectionParameters.nativeConnectionString) conString = self.connectionParameters.nativeConnectionString;
        if (err) return cb(err);
        self.native.connect(conString, function(err2) {
          if (err2) {
            self.native.end();
            return cb(err2);
          }
          self._connected = true;
          self.native.on("error", function(err3) {
            self._queryable = false;
            self._errorAllQueries(err3);
            self.emit("error", err3);
          });
          self.native.on("notification", function(msg) {
            self.emit("notification", {
              channel: msg.relname,
              payload: msg.extra
            });
          });
          self.emit("connect");
          self._pulseQueryQueue(true);
          cb(null, this);
        });
      });
    };
    Client2.prototype.connect = function(callback) {
      if (callback) {
        this._connect(callback);
        return;
      }
      return new this._Promise((resolve, reject) => {
        this._connect((error) => {
          if (error) {
            reject(error);
          } else {
            resolve(this);
          }
        });
      });
    };
    Client2.prototype.query = function(config, values, callback) {
      let query;
      let result;
      let readTimeout;
      let readTimeoutTimer;
      let queryCallback;
      if (config === null || config === void 0) {
        throw new TypeError("Client was passed a null or undefined query");
      } else if (typeof config.submit === "function") {
        readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
        result = query = config;
        if (typeof values === "function") {
          config.callback = values;
        }
      } else {
        readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
        query = new NativeQuery(config, values, callback);
        if (!query.callback) {
          let resolveOut, rejectOut;
          result = new this._Promise((resolve, reject) => {
            resolveOut = resolve;
            rejectOut = reject;
          }).catch((err) => {
            Error.captureStackTrace(err);
            throw err;
          });
          query.callback = (err, res) => err ? rejectOut(err) : resolveOut(res);
        }
      }
      if (readTimeout) {
        queryCallback = query.callback || (() => {
        });
        readTimeoutTimer = setTimeout(() => {
          const error = new Error("Query read timeout");
          process.nextTick(() => {
            query.handleError(error, this.connection);
          });
          queryCallback(error);
          query.callback = () => {
          };
          const index = this._queryQueue.indexOf(query);
          if (index > -1) {
            this._queryQueue.splice(index, 1);
          }
          this._pulseQueryQueue();
        }, readTimeout);
        query.callback = (err, res) => {
          clearTimeout(readTimeoutTimer);
          queryCallback(err, res);
        };
      }
      if (!this._queryable) {
        query.native = this.native;
        process.nextTick(() => {
          query.handleError(new Error("Client has encountered a connection error and is not queryable"));
        });
        return result;
      }
      if (this._ending) {
        query.native = this.native;
        process.nextTick(() => {
          query.handleError(new Error("Client was closed and is not queryable"));
        });
        return result;
      }
      if (this._queryQueue.length > 0) {
        queryQueueLengthDeprecationNotice();
      }
      this._queryQueue.push(query);
      this._pulseQueryQueue();
      return result;
    };
    Client2.prototype.end = function(cb) {
      const self = this;
      this._ending = true;
      if (!this._connected) {
        this.once("connect", this.end.bind(this, cb));
      }
      let result;
      if (!cb) {
        result = new this._Promise(function(resolve, reject) {
          cb = (err) => err ? reject(err) : resolve();
        });
      }
      this.native.end(function() {
        self._connected = false;
        self._errorAllQueries(new Error("Connection terminated"));
        process.nextTick(() => {
          self.emit("end");
          if (cb) cb();
        });
      });
      return result;
    };
    Client2.prototype._hasActiveQuery = function() {
      return this._activeQuery && this._activeQuery.state !== "error" && this._activeQuery.state !== "end";
    };
    Client2.prototype._pulseQueryQueue = function(initialConnection) {
      if (!this._connected) {
        return;
      }
      if (this._hasActiveQuery()) {
        return;
      }
      const query = this._queryQueue.shift();
      if (!query) {
        if (!initialConnection) {
          this.emit("drain");
        }
        return;
      }
      this._activeQuery = query;
      query.submit(this);
      const self = this;
      query.once("_done", function() {
        self._pulseQueryQueue();
      });
    };
    Client2.prototype.cancel = function(query) {
      if (this._activeQuery === query) {
        this.native.cancel(function() {
        });
      } else if (this._queryQueue.indexOf(query) !== -1) {
        this._queryQueue.splice(this._queryQueue.indexOf(query), 1);
      }
    };
    Client2.prototype.ref = function() {
    };
    Client2.prototype.unref = function() {
    };
    Client2.prototype.setTypeParser = function(oid, format, parseFn) {
      return this._types.setTypeParser(oid, format, parseFn);
    };
    Client2.prototype.getTypeParser = function(oid, format) {
      return this._types.getTypeParser(oid, format);
    };
    Client2.prototype.isConnected = function() {
      return this._connected;
    };
  }
});

// node_modules/pg/lib/native/index.js
var require_native = __commonJS({
  "node_modules/pg/lib/native/index.js"(exports2, module2) {
    "use strict";
    module2.exports = require_client2();
  }
});

// node_modules/pg/lib/index.js
var require_lib2 = __commonJS({
  "node_modules/pg/lib/index.js"(exports2, module2) {
    "use strict";
    var Client2 = require_client();
    var defaults2 = require_defaults();
    var Connection2 = require_connection();
    var Result2 = require_result();
    var utils = require_utils();
    var Pool2 = require_pg_pool();
    var TypeOverrides2 = require_type_overrides();
    var { DatabaseError: DatabaseError2 } = require_dist();
    var { escapeIdentifier: escapeIdentifier2, escapeLiteral: escapeLiteral2 } = require_utils();
    var poolFactory = (Client3) => {
      return class BoundPool extends Pool2 {
        constructor(options) {
          super(options, Client3);
        }
      };
    };
    var PG = function(clientConstructor2) {
      this.defaults = defaults2;
      this.Client = clientConstructor2;
      this.Query = this.Client.Query;
      this.Pool = poolFactory(this.Client);
      this._pools = [];
      this.Connection = Connection2;
      this.types = require_pg_types();
      this.DatabaseError = DatabaseError2;
      this.TypeOverrides = TypeOverrides2;
      this.escapeIdentifier = escapeIdentifier2;
      this.escapeLiteral = escapeLiteral2;
      this.Result = Result2;
      this.utils = utils;
    };
    var clientConstructor = Client2;
    var forceNative = false;
    try {
      forceNative = !!process.env.NODE_PG_FORCE_NATIVE;
    } catch {
    }
    if (forceNative) {
      clientConstructor = require_native();
    }
    module2.exports = new PG(clientConstructor);
    Object.defineProperty(module2.exports, "native", {
      configurable: true,
      enumerable: false,
      get() {
        let native = null;
        try {
          native = new PG(require_native());
        } catch (err) {
          if (err.code !== "MODULE_NOT_FOUND") {
            throw err;
          }
        }
        Object.defineProperty(module2.exports, "native", {
          value: native
        });
        return native;
      }
    });
  }
});

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode23 = __toESM(require("vscode"));

// src/database/connectionManager.ts
var vscode = __toESM(require("vscode"));

// node_modules/pg/esm/index.mjs
var import_lib = __toESM(require_lib2(), 1);
var Client = import_lib.default.Client;
var Pool = import_lib.default.Pool;
var Connection = import_lib.default.Connection;
var types = import_lib.default.types;
var Query = import_lib.default.Query;
var DatabaseError = import_lib.default.DatabaseError;
var escapeIdentifier = import_lib.default.escapeIdentifier;
var escapeLiteral = import_lib.default.escapeLiteral;
var Result = import_lib.default.Result;
var TypeOverrides = import_lib.default.TypeOverrides;
var defaults = import_lib.default.defaults;

// src/database/drivers/postgresDriver.ts
var import_crypto = require("crypto");

// src/utils/identifiers.ts
function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}
function qualifiedName(schema, name) {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
}

// src/database/drivers/postgresDriver.ts
var PostgresDriver = class {
  id = "postgres";
  displayName = "PostgreSQL";
  pools = /* @__PURE__ */ new Map();
  configs = /* @__PURE__ */ new Map();
  activeExecutions = /* @__PURE__ */ new Map();
  async testConnection(config) {
    let pool;
    try {
      pool = await this.createVerifiedPool(config, 1);
      const result = await pool.query("select version() as version");
      return { ok: true, message: "Connection successful", serverVersion: result.rows[0]?.version };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (pool) {
        await this.endPool(pool);
      }
    }
  }
  async connect(config) {
    await this.disconnect(config.id);
    const pool = await this.createVerifiedPool(config, 8);
    this.pools.set(config.id, pool);
    this.configs.set(config.id, config);
    return { id: config.id, config, connectedAt: Date.now() };
  }
  async disconnect(connectionId) {
    const pool = this.pools.get(connectionId);
    if (pool) {
      this.pools.delete(connectionId);
      await pool.end();
    }
  }
  async executeQuery(params) {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }
  async executeStatements(params, statements) {
    const pool = this.requirePool(params.connectionId);
    const client = await pool.connect();
    const results = [];
    const hasExplicitTransaction = statements.some((sql) => /\bbegin\b/i.test(sql));
    try {
      for (const [index, sql] of statements.entries()) {
        const executionId = (0, import_crypto.randomUUID)();
        const started = Date.now();
        params.onProgress?.({
          statementIndex: index,
          statementCount: statements.length,
          sql,
          status: "started",
          executionId,
          startedAt: started
        });
        this.activeExecutions.set(executionId, { connectionId: params.connectionId, processId: client.processID });
        try {
          const result = await client.query(this.sqlWithClientLimit(sql, params.maxRows));
          const queryResults = Array.isArray(result) ? result : [result];
          const executionResults = queryResults.map((item) => this.toExecutionResult(item, executionId, started));
          params.onProgress?.({
            statementIndex: index,
            statementCount: statements.length,
            sql,
            status: "completed",
            executionId,
            startedAt: started,
            durationMs: Date.now() - started,
            rowCount: executionResults.reduce((total, item) => total + item.rowCount, 0),
            command: executionResults.at(-1)?.command
          });
          for (const item of executionResults) {
            results.push(item);
          }
        } catch (error) {
          params.onProgress?.({
            statementIndex: index,
            statementCount: statements.length,
            sql,
            status: "failed",
            executionId,
            startedAt: started,
            durationMs: Date.now() - started,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          throw error;
        } finally {
          this.activeExecutions.delete(executionId);
        }
      }
      return results;
    } catch (error) {
      if (hasExplicitTransaction) {
        try {
          await client.query("rollback");
        } catch {
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }
  async validateQuery(params) {
    const pool = this.requirePool(params.connectionId);
    const sql = params.sql.trim().replace(/;+\s*$/, "");
    if (!sql || !this.canExplain(sql)) {
      return { ok: true };
    }
    try {
      await pool.query(`explain ${sql}`);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.toQueryError(error) };
    }
  }
  async cancelQuery(executionId) {
    const active = this.activeExecutions.get(executionId);
    if (!active?.processId) {
      return;
    }
    const pool = this.requirePool(active.connectionId);
    await pool.query("select pg_cancel_backend($1)", [active.processId]);
  }
  async getSchemas(connectionId) {
    const result = await this.requirePool(connectionId).query(
      `select schema_name as name
       from information_schema.schemata
       where schema_name not like 'pg_%' and schema_name <> 'information_schema'
       order by schema_name`
    );
    return result.rows;
  }
  async getTables(connectionId, schema) {
    const result = await this.requirePool(connectionId).query(
      `select n.nspname as schema, c.relname as name,
              case when c.relkind = 'm' then 'materialized_view' else 'table' end as type,
              c.reltuples::bigint as "rowEstimate",
              obj_description(c.oid) as comment
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = $1 and c.relkind in ('r', 'p', 'm')
       order by c.relname`,
      [schema]
    );
    return result.rows;
  }
  async getViews(connectionId, schema) {
    const result = await this.requirePool(connectionId).query(
      `select table_schema as schema, table_name as name, 'view' as type
       from information_schema.views
       where table_schema = $1
       order by table_name`,
      [schema]
    );
    return result.rows;
  }
  async getColumns(connectionId, schema, table) {
    const result = await this.requirePool(connectionId).query(
      `select c.table_schema as schema, c.table_name as table, c.column_name as name,
              c.ordinal_position as ordinal, c.data_type as "dataType",
              c.is_nullable = 'YES' as nullable, c.column_default as "defaultValue",
              col_description((quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass::oid, c.ordinal_position) as comment
       from information_schema.columns c
       where c.table_schema = $1 and c.table_name = $2
       order by c.ordinal_position`,
      [schema, table]
    );
    return result.rows;
  }
  async getIndexes(connectionId, schema, table) {
    const result = await this.requirePool(connectionId).query(
      `select indexname as name, indexdef as definition
       from pg_indexes
       where schemaname = $1 and tablename = $2
       order by indexname`,
      [schema, table]
    );
    return result.rows.map((row) => ({
      name: row.name,
      definition: row.definition,
      columns: this.columnsFromIndexDefinition(row.definition),
      unique: /\bunique\b/i.test(row.definition)
    }));
  }
  async getPrimaryKeys(connectionId, schema, table) {
    const result = await this.requirePool(connectionId).query(
      `select tc.constraint_name as name, array_agg(kcu.column_name order by kcu.ordinal_position) as columns
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = $1 and tc.table_name = $2
       group by tc.constraint_name`,
      [schema, table]
    );
    return result.rows;
  }
  async getForeignKeys(connectionId, schema, table) {
    const result = await this.requirePool(connectionId).query(
      `select tc.constraint_name as name,
              array_agg(kcu.column_name order by kcu.ordinal_position) as columns,
              ccu.table_schema as "foreignSchema",
              ccu.table_name as "foreignTable",
              array_agg(ccu.column_name order by kcu.ordinal_position) as "foreignColumns"
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
       where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = $1 and tc.table_name = $2
       group by tc.constraint_name, ccu.table_schema, ccu.table_name`,
      [schema, table]
    );
    return result.rows;
  }
  async getTablePreview(connectionId, schema, table, limit, options) {
    const where = options?.where?.trim();
    if (where && /;|--|\/\*/.test(where)) {
      throw new Error("WHERE must be a single SQL expression without comments or semicolons.");
    }
    const orderBySql = options?.orderBySql?.trim();
    if (orderBySql && /;|--|\/\*/.test(orderBySql)) {
      throw new Error("ORDER BY must be a single SQL expression without comments or semicolons.");
    }
    const orderBy = orderBySql ? `
order by ${orderBySql}` : options?.orderBy?.length ? `
order by ${options.orderBy.map((item) => `${quoteIdentifier(item.column)} ${item.direction === "desc" ? "desc" : "asc"}`).join(", ")}` : "";
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
    const paging = pageLimit ? `
limit ${pageLimit}${offset ? ` offset ${offset}` : ""}` : "";
    const sql = `select * from ${qualifiedName(schema, table)}${where ? `
where ${where}` : ""}${orderBy}${paging}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }
  async getTableDDL(connectionId, schema, table) {
    const columns = await this.getColumns(connectionId, schema, table);
    const lines = columns.map((column) => {
      const nullable = column.nullable ? "" : " not null";
      const defaultValue = column.defaultValue ? ` default ${column.defaultValue}` : "";
      return `  ${quoteIdentifier(column.name)} ${column.dataType}${defaultValue}${nullable}`;
    });
    return `create table ${qualifiedName(schema, table)} (
${lines.join(",\n")}
);`;
  }
  requirePool(connectionId) {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      throw new Error("Connection is not active. Connect first.");
    }
    return pool;
  }
  toPoolConfig(config, max) {
    return {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      max,
      connectionTimeoutMillis: config.connectTimeoutMs ?? 1e4,
      query_timeout: config.queryTimeoutMs,
      ssl: config.sslMode === "disable" ? false : { rejectUnauthorized: false }
    };
  }
  shouldRetryWithoutSsl(config, error) {
    const message = error instanceof Error ? error.message : String(error);
    return config.sslMode === "prefer" && /server does not support ssl connections/i.test(message);
  }
  async createVerifiedPool(config, max) {
    const pool = new Pool(this.toPoolConfig(config, max));
    try {
      await pool.query("select 1");
      return pool;
    } catch (error) {
      await this.endPool(pool);
      if (!this.shouldRetryWithoutSsl(config, error)) {
        throw error;
      }
      const fallbackPool = new Pool(this.toPoolConfig({ ...config, sslMode: "disable" }, max));
      try {
        await fallbackPool.query("select 1");
        return fallbackPool;
      } catch (fallbackError) {
        await this.endPool(fallbackPool);
        throw fallbackError;
      }
    }
  }
  async endPool(pool) {
    try {
      await pool.end();
    } catch {
    }
  }
  columnsFromIndexDefinition(definition) {
    const match = definition.match(/\((.*)\)/);
    return match ? match[1].split(",").map((part) => part.trim().replace(/^"|"$/g, "")) : [];
  }
  canApplyClientLimit(sql) {
    const normalized = sql.trim().replace(/^--.*$/gm, "").trim().toLowerCase();
    return normalized.startsWith("select") || normalized.startsWith("with");
  }
  sqlWithClientLimit(sql, maxRows) {
    const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : void 0;
    return limit && this.canApplyClientLimit(sql) ? `select * from (${sql.replace(/;+\s*$/, "")}) __dg_query limit ${limit}` : sql;
  }
  toExecutionResult(result, executionId, started) {
    const fields = result?.fields ?? [];
    const rows = result?.rows ?? [];
    return {
      executionId,
      fields: fields.map((field) => ({ name: field.name, dataTypeId: field.dataTypeID })),
      rows,
      rowCount: result?.rowCount ?? rows.length,
      command: result?.command,
      durationMs: Date.now() - started
    };
  }
  canExplain(sql) {
    const normalized = sql.trim().replace(/^--.*$/gm, "").trim().toLowerCase();
    return /^(select|with|insert|update|delete|merge)\b/.test(normalized);
  }
  toQueryError(error) {
    const pgError = error;
    return {
      message: pgError.message ?? String(error),
      code: pgError.code,
      detail: pgError.detail,
      hint: pgError.hint,
      position: pgError.position,
      where: pgError.where
    };
  }
};

// src/database/drivers/redshiftDriver.ts
var RedshiftDriver = class extends PostgresDriver {
  id = "redshift";
  displayName = "Amazon Redshift";
  async getSchemas(connectionId) {
    const pool = this.requirePool(connectionId);
    try {
      const result = await pool.query(
        `select distinct name
         from (
           select schema_name as name
           from svv_all_schemas
           where database_name = current_database()
           union all
           select nspname as name
           from pg_namespace
         ) schemas
         where name <> 'information_schema' and name not like 'pg_toast%' and name not like 'pg_temp%'
         order by name`
      );
      return result.rows;
    } catch {
      const result = await pool.query(
        `select nspname as name
         from pg_namespace
         where nspname <> 'information_schema' and nspname not like 'pg_toast%' and nspname not like 'pg_temp%'
         order by nspname`
      );
      return result.rows;
    }
  }
  async getTables(connectionId, schema) {
    const pool = this.requirePool(connectionId);
    try {
      const result = await pool.query(
        `select schema_name as schema,
                table_name as name,
                case when lower(table_type) like '%materialized%' then 'materialized_view' else 'table' end as type,
                remarks as comment
         from svv_all_tables
         where database_name = current_database() and schema_name = $1
         order by table_name`,
        [schema]
      );
      return result.rows;
    } catch {
      const result = await pool.query(
        `select schemaname as schema, tablename as name, 'table' as type
         from pg_tables
         where schemaname = $1
         order by tablename`,
        [schema]
      );
      return result.rows;
    }
  }
  async getViews(connectionId, schema) {
    const result = await this.requirePool(connectionId).query(
      `select schemaname as schema, viewname as name, 'view' as type
       from pg_views
       where schemaname = $1
       order by viewname`,
      [schema]
    );
    return result.rows;
  }
  async getColumns(connectionId, schema, table) {
    const result = await this.requirePool(connectionId).query(
      `select table_schema as schema, table_name as table, column_name as name,
              ordinal_position as ordinal, data_type as "dataType",
              is_nullable = 'YES' as nullable, column_default as "defaultValue"
       from information_schema.columns
       where table_schema = $1 and table_name = $2
       order by ordinal_position`,
      [schema, table]
    );
    return result.rows;
  }
  shouldRetryWithoutSsl(_config, _error) {
    return false;
  }
  toPoolConfig(config, max) {
    return {
      ...super.toPoolConfig({ ...config, sslMode: config.sslMode === "disable" ? "prefer" : config.sslMode }, max),
      port: config.port || 5439
    };
  }
};

// src/utils/id.ts
function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// src/services/connectionDefaults.ts
var DEFAULTS_BY_DATABASE_TYPE = {
  postgres: {
    name: "PostgreSQL",
    port: "5432",
    database: "postgres",
    sslMode: "disable",
    color: "green"
  },
  redshift: {
    name: "Redshift",
    port: "5439",
    database: "dev",
    sslMode: "require",
    color: "purple"
  }
};
function connectionDefaultsForType(type) {
  return DEFAULTS_BY_DATABASE_TYPE[type];
}

// src/database/connectionManager.ts
var ConnectionManager = class {
  constructor(store) {
    this.store = store;
    this.drivers.set("postgres", new PostgresDriver());
    this.drivers.set("redshift", new RedshiftDriver());
  }
  drivers = /* @__PURE__ */ new Map();
  active = /* @__PURE__ */ new Map();
  activeConnectionEmitter = new vscode.EventEmitter();
  onDidChangeActiveConnections = this.activeConnectionEmitter.event;
  getConnections() {
    return this.store.getAll();
  }
  getActiveConnections() {
    return [...this.active.values()];
  }
  isConnected(id) {
    return this.active.has(id);
  }
  getConnection(id) {
    return this.store.getAll().find((connection) => connection.id === id);
  }
  getPreferredConnection() {
    const selected = this.store.getSelectedConnectionId();
    return this.active.get(selected ?? "")?.config ?? (selected ? this.getConnection(selected) : void 0) ?? this.getActiveConnections()[0]?.config ?? this.getConnections()[0];
  }
  async getConnectionWithPassword(id) {
    const config = this.getConnection(id);
    if (!config) {
      throw new Error("Connection not found.");
    }
    return this.store.withPassword(config);
  }
  getDriverByConnectionId(id) {
    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error("Connection not found.");
    }
    return this.getDriver(connection.type);
  }
  getDriver(type) {
    const driver = this.drivers.get(type);
    if (!driver) {
      throw new Error(`Unsupported database type: ${type}`);
    }
    return driver;
  }
  async save(config) {
    const activeConnection = this.active.get(config.id);
    await this.store.save(config);
    if (!activeConnection) {
      return;
    }
    if (activeConnection.config.type !== config.type) {
      await this.getDriver(activeConnection.config.type).disconnect(config.id);
    }
    try {
      const nextConfig = await this.getConnectionWithPassword(config.id);
      const connection = await this.getDriver(nextConfig.type).connect(nextConfig);
      this.active.set(config.id, connection);
      await this.store.setSelectedConnectionId(config.id);
      this.activeConnectionEmitter.fire(config.id);
    } catch (error) {
      this.active.delete(config.id);
      this.activeConnectionEmitter.fire(config.id);
      throw error;
    }
  }
  async setSelectedConnection(id) {
    await this.store.setSelectedConnectionId(id);
  }
  async delete(id) {
    await this.disconnect(id);
    await this.store.delete(id);
  }
  async connect(id) {
    const config = await this.getConnectionWithPassword(id);
    try {
      const connection = await this.getDriver(config.type).connect(config);
      this.active.set(id, connection);
      await this.store.setSelectedConnectionId(id);
      this.activeConnectionEmitter.fire(id);
      return connection;
    } catch (error) {
      if (this.active.has(id)) {
        this.active.delete(id);
        this.activeConnectionEmitter.fire(id);
      }
      throw error;
    }
  }
  async disconnect(id) {
    const wasConnected = this.active.has(id);
    const config = this.getConnection(id);
    if (config) {
      await this.getDriver(config.type).disconnect(id);
    }
    this.active.delete(id);
    if (wasConnected) {
      this.activeConnectionEmitter.fire(id);
    }
  }
  async test(id) {
    const config = await this.getConnectionWithPassword(id);
    return this.testConfig(config);
  }
  async testConfig(config) {
    const result = await this.getDriver(config.type).testConnection(config);
    if (!result.ok) {
      throw new Error(`Connection failed for ${config.username}@${config.host}:${config.port}/${config.database}: ${result.message}`);
    }
    return result.serverVersion ?? result.message;
  }
  async pickConnection() {
    const connections = this.getConnections();
    if (connections.length === 0) {
      const create = await vscode.window.showInformationMessage("No database connections yet.", "Add Connection");
      if (create === "Add Connection") {
        return this.promptConnection();
      }
      return void 0;
    }
    const selectedId = this.store.getSelectedConnectionId();
    const picked = await vscode.window.showQuickPick(connections.map((connection) => ({
      label: truncateMiddle(connection.name, 48),
      description: `${this.isConnected(connection.id) ? "online" : "offline"} - ${connection.type}`,
      detail: `${connection.username}@${connection.host}:${connection.port}/${connection.database}`,
      connection
    })), { placeHolder: "Select database connection" });
    return picked?.connection ?? connections.find((connection) => connection.id === selectedId);
  }
  async promptConnection(existing) {
    const typePick = await vscode.window.showQuickPick([
      { label: "PostgreSQL", type: "postgres" },
      { label: "Amazon Redshift", type: "redshift" }
    ], { placeHolder: "Database type" });
    if (!typePick) {
      return void 0;
    }
    const type = typePick.type;
    const defaults2 = connectionDefaultsForType(type);
    const name = await vscode.window.showInputBox({ prompt: "Connection name", value: existing?.name ?? defaults2.name });
    if (!name) {
      return void 0;
    }
    const host = await vscode.window.showInputBox({ prompt: "Host", value: existing?.host ?? "localhost" });
    if (!host) {
      return void 0;
    }
    const port = Number(await vscode.window.showInputBox({ prompt: "Port", value: String(existing?.port ?? defaults2.port) }));
    const database = await vscode.window.showInputBox({ prompt: "Database", value: existing?.database ?? defaults2.database });
    if (!database) {
      return void 0;
    }
    const username = await vscode.window.showInputBox({ prompt: "Username", value: existing?.username });
    if (!username) {
      return void 0;
    }
    const password = await vscode.window.showInputBox({ prompt: "Password", password: true });
    const ssl = await vscode.window.showQuickPick(["disable", "prefer", "require"], { placeHolder: "SSL mode" });
    return {
      id: existing?.id ?? createId("conn"),
      name,
      type,
      host,
      port,
      database,
      username,
      password,
      sslMode: ssl ?? defaults2.sslMode,
      color: existing?.color ?? defaults2.color,
      defaultSchema: existing?.defaultSchema ?? "public",
      queryTimeoutMs: vscode.workspace.getConfiguration("database").get("query.timeoutMs", 3e5)
    };
  }
};
function truncateMiddle(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  const keep = Math.max(4, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

// src/database/queryExecutor.ts
var vscode2 = __toESM(require("vscode"));

// src/database/sqlSplitter.ts
function splitSqlStatements(text) {
  const statements = [];
  let start = 0;
  let i = 0;
  let single = false;
  let double = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag;
  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];
    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
      }
      i += 1;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        i += dollarTag.length;
        dollarTag = void 0;
      } else {
        i += 1;
      }
      continue;
    }
    if (single) {
      if (char === "'" && next === "'") {
        i += 2;
      } else if (char === "'") {
        single = false;
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }
    if (double) {
      if (char === '"' && next === '"') {
        i += 2;
      } else if (char === '"') {
        double = false;
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      i += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      i += 2;
      continue;
    }
    if (char === "'") {
      single = true;
      i += 1;
      continue;
    }
    if (char === '"') {
      double = true;
      i += 1;
      continue;
    }
    if (char === "$") {
      const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        i += dollarTag.length;
        continue;
      }
    }
    if (char === ";") {
      const bounds2 = trimmedBounds(text, start, i);
      if (bounds2) {
        statements.push({ sql: text.slice(bounds2.start, bounds2.end), start: bounds2.start, end: bounds2.end });
      }
      start = i + 1;
    }
    i += 1;
  }
  const bounds = trimmedBounds(text, start, text.length);
  if (bounds) {
    statements.push({ sql: text.slice(bounds.start, bounds.end), start: bounds.start, end: bounds.end });
  }
  return statements;
}
function trimmedBounds(text, start, end) {
  let nextStart = start;
  let nextEnd = end;
  while (nextStart < nextEnd && /\s/.test(text[nextStart])) {
    nextStart += 1;
  }
  while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1])) {
    nextEnd -= 1;
  }
  return nextStart < nextEnd ? { start: nextStart, end: nextEnd } : void 0;
}

// src/services/queryMemoryMetadata.ts
function extractQueryTables(sql) {
  const tables = /* @__PURE__ */ new Set();
  const regex = /\b(?:from|join|update|into)\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    tables.add(stripQuotes(match[1]));
  }
  return [...tables];
}
function extractQualifiedColumns(sql) {
  const columns = /* @__PURE__ */ new Set();
  const regex = /(?:"([^"]+)"|(\b[A-Za-z_][A-Za-z0-9_]*\b))\s*\.\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/g;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    const before = sql.slice(Math.max(0, match.index - 16), match.index);
    if (/\b(from|join|update|into)\s+$/i.test(before)) {
      continue;
    }
    columns.add(`${stripQuotes(match[1] ?? match[2])}.${stripQuotes(match[3] ?? match[4])}`);
  }
  return [...columns];
}
function outputColumnNames(fields) {
  return [...new Set((fields ?? []).map((field) => field.name).filter(Boolean))];
}
function stripQuotes(value) {
  return value.replace(/^"|"$/g, "");
}

// src/services/sqlSafetyClassifier.ts
var DESTRUCTIVE_RE = /\b(drop|truncate|alter)\b/i;
var WRITE_RE = /\b(insert\s+into|update|delete\s+from|create\s+(?:unique\s+)?index|create\s+table|create\s+schema)\b/i;
var SqlSafetyClassifier = class {
  classify(sql, options = {}) {
    const statements = splitSqlStatements(sql).map((statement) => statement.sql);
    const parts = statements.length ? statements : [sql.trim()].filter(Boolean);
    const reasons = [];
    let risk = "safe";
    let previewAvailable = false;
    for (const statement of parts) {
      if (DESTRUCTIVE_RE.test(statement)) {
        risk = this.maxRisk(risk, "destructive");
        reasons.push("Contains DROP, TRUNCATE, or ALTER.");
      }
      if (/\bcreate\s+(?:unique\s+)?index\b/i.test(statement)) {
        risk = this.maxRisk(risk, "write");
        reasons.push("Creates an index, which can be expensive on large tables.");
        previewAvailable = true;
      }
      if (/\bdelete\s+from\b/i.test(statement)) {
        risk = this.maxRisk(risk, "write");
        previewAvailable = true;
        if (!/\bwhere\b/i.test(statement)) {
          risk = this.maxRisk(risk, "destructive");
          reasons.push("DELETE has no WHERE clause.");
        } else {
          reasons.push("Deletes rows.");
        }
      }
      if (/\bupdate\b/i.test(statement)) {
        risk = this.maxRisk(risk, "write");
        previewAvailable = true;
        if (!/\bwhere\b/i.test(statement)) {
          risk = this.maxRisk(risk, "destructive");
          reasons.push("UPDATE has no WHERE clause.");
        } else {
          reasons.push("Updates rows.");
        }
      }
      if (WRITE_RE.test(statement) && risk === "safe") {
        risk = "write";
        reasons.push("Writes database objects or rows.");
      }
    }
    if (options.production) {
      risk = this.maxRisk(risk, "production");
      reasons.push("Connection is marked production.");
    }
    return {
      risk,
      reasons: [...new Set(reasons)],
      statements: parts,
      requiresConfirmation: risk !== "safe",
      previewAvailable: previewAvailable || risk === "destructive" || risk === "production"
    };
  }
  previewSql(sql) {
    const first = splitSqlStatements(sql)[0]?.sql ?? sql.trim();
    if (!first) {
      return void 0;
    }
    if (/^\s*(select|with)\b/i.test(first)) {
      return `explain ${first}`;
    }
    const deleteMatch = first.match(/\bdelete\s+from\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)([\s\S]*)/i);
    if (deleteMatch) {
      const where = deleteMatch[2].match(/\bwhere\b[\s\S]*/i)?.[0] ?? "";
      return `select *
from ${deleteMatch[1]}
${where}
limit 100;`.trim();
    }
    const updateMatch = first.match(/\bupdate\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)[\s\S]*?\bwhere\b([\s\S]*)/i);
    if (updateMatch) {
      return `select *
from ${updateMatch[1]}
where ${updateMatch[2].trim()}
limit 100;`;
    }
    return `explain ${first}`;
  }
  maxRisk(current, next) {
    const order = ["safe", "write", "destructive", "production"];
    return order.indexOf(next) > order.indexOf(current) ? next : current;
  }
};

// src/database/queryExecutor.ts
var QueryExecutor = class {
  constructor(connectionManager, historyStore, recorder, safety = new SqlSafetyClassifier()) {
    this.connectionManager = connectionManager;
    this.historyStore = historyStore;
    this.recorder = recorder;
    this.safety = safety;
  }
  async execute(params) {
    const config = this.connectionManager.getConnection(params.connectionId);
    if (!config) {
      throw new Error("Connection not found.");
    }
    const started = Date.now();
    const tabId = createId("tab");
    const resultSets = [];
    try {
      if (!this.connectionManager.isConnected(params.connectionId)) {
        await this.connectionManager.connect(params.connectionId);
      }
      await this.confirmDestructiveIfNeeded(config.production === true, params.sql);
      const statements = splitSqlStatements(params.sql);
      const sqlParts = statements.length ? statements.map((statement) => statement.sql) : [params.sql];
      const results = await this.connectionManager.getDriver(config.type).executeStatements(params, sqlParts);
      for (const [index, result] of results.entries()) {
        resultSets.push({
          id: result.executionId,
          title: sqlParts.length > 1 ? `Result ${index + 1}` : this.resultTitle(sqlParts[index] ?? params.sql, params.source?.fileName),
          fields: result.fields,
          rows: result.rows,
          rowCount: result.rowCount,
          maxRows: params.maxRows,
          command: result.command,
          durationMs: result.durationMs
        });
      }
      const durationMs = Date.now() - started;
      const historyItem = {
        id: createId("history"),
        connectionId: config.id,
        databaseType: config.type,
        sql: params.sql,
        sourceOrigin: params.source?.origin,
        sourceFile: params.source?.fileName,
        documentUri: params.source?.documentUri,
        schemaName: config.defaultSchema,
        sourceRange: params.source?.range,
        favorite: false,
        executedAt: started,
        durationMs,
        rowCount: resultSets.reduce((total, set) => total + set.rowCount, 0),
        status: "completed",
        outputColumns: outputColumnNames(resultSets[0]?.fields),
        tables: extractQueryTables(params.sql),
        columns: extractQualifiedColumns(params.sql)
      };
      await this.recordHistory(params, historyItem);
      return {
        id: tabId,
        title: this.resultTitle(params.sql, params.source?.fileName),
        pinned: false,
        connectionId: config.id,
        databaseType: config.type,
        databaseName: config.database,
        schemaName: config.defaultSchema,
        queryText: params.sql,
        sourceOrigin: params.source?.origin,
        sourceFile: params.source?.fileName,
        sourceDocumentUri: params.source?.documentUri,
        sourceQueryId: params.source?.queryId,
        sourceSectionIndex: params.source?.sectionIndex,
        sourceRange: params.source?.range,
        executionStatus: "completed",
        executionStartedAt: started,
        executionFinishedAt: Date.now(),
        executionTimeMs: durationMs,
        rowCount: resultSets.reduce((total, set) => total + set.rowCount, 0),
        maxRows: params.maxRows,
        resultSets,
        activeResultSetIndex: 0,
        filters: [],
        sort: [],
        columnState: [],
        createdAt: started,
        updatedAt: Date.now()
      };
    } catch (error) {
      const queryError = this.toQueryError(error);
      const historyItem = {
        id: createId("history"),
        connectionId: config.id,
        databaseType: config.type,
        sql: params.sql,
        sourceOrigin: params.source?.origin,
        sourceFile: params.source?.fileName,
        documentUri: params.source?.documentUri,
        schemaName: config.defaultSchema,
        sourceRange: params.source?.range,
        favorite: false,
        executedAt: started,
        durationMs: Date.now() - started,
        status: "failed",
        errorMessage: queryError.message,
        tables: extractQueryTables(params.sql),
        columns: extractQualifiedColumns(params.sql)
      };
      await this.recordHistory(params, historyItem);
      return {
        id: tabId,
        title: this.resultTitle(params.sql, params.source?.fileName),
        pinned: false,
        connectionId: config.id,
        databaseType: config.type,
        databaseName: config.database,
        schemaName: config.defaultSchema,
        queryText: params.sql,
        sourceOrigin: params.source?.origin,
        sourceFile: params.source?.fileName,
        sourceDocumentUri: params.source?.documentUri,
        sourceQueryId: params.source?.queryId,
        sourceSectionIndex: params.source?.sectionIndex,
        sourceRange: params.source?.range,
        executionStatus: "failed",
        executionStartedAt: started,
        executionFinishedAt: Date.now(),
        executionTimeMs: Date.now() - started,
        maxRows: params.maxRows,
        error: queryError,
        resultSets: [],
        activeResultSetIndex: 0,
        filters: [],
        sort: [],
        columnState: [],
        createdAt: started,
        updatedAt: Date.now()
      };
    }
  }
  async cancel(connectionId, executionId) {
    const driver = this.connectionManager.getDriverByConnectionId(connectionId);
    await driver.cancelQuery(executionId);
  }
  resultTitle(sql, fileName) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    const from = normalized.match(/\bfrom\s+("?[\w.]+"?)/i)?.[1];
    const keyword = normalized.match(/^\w+/)?.[0]?.toUpperCase() ?? "SQL";
    if (from) {
      return `${keyword} ${from.replace(/"/g, "")}`;
    }
    if (normalized) {
      return keyword;
    }
    return fileName?.split(/[\\/]/).pop() ?? "SQL";
  }
  async recordHistory(params, item) {
    if (params.source?.origin !== "queryConsole") {
      return;
    }
    await this.historyStore.add(item);
    await this.recorder?.recordHistoryItem(item);
  }
  async confirmDestructiveIfNeeded(isProduction, sql) {
    const confirm = vscode2.workspace.getConfiguration("database").get("safety.confirmDestructiveQueries", true);
    const warnAll = vscode2.workspace.getConfiguration("database").get("safety.confirmDestructiveQueriesOnAllConnections", false);
    if (!confirm || !isProduction && !warnAll) {
      return;
    }
    const assessment = this.safety.classify(sql, { production: isProduction });
    if (!assessment.requiresConfirmation) {
      return;
    }
    const target = isProduction ? "production connection" : "connection";
    const detail = assessment.reasons.length ? ` ${assessment.reasons.join(" ")}` : "";
    const answer = await vscode2.window.showWarningMessage(`This looks risky on a ${target}.${detail}`, { modal: true }, "Run Anyway");
    if (answer !== "Run Anyway") {
      throw new Error("Query cancelled by safety confirmation.");
    }
  }
  toQueryError(error) {
    const pgError = error;
    return {
      message: pgError.message ?? String(error),
      code: pgError.code,
      detail: pgError.detail,
      hint: pgError.hint,
      position: pgError.position,
      where: pgError.where
    };
  }
};

// src/explorer/DatabaseTreeProvider.ts
var vscode4 = __toESM(require("vscode"));

// src/explorer/nodes.ts
var vscode3 = __toESM(require("vscode"));
var ConnectionNode = class extends vscode3.TreeItem {
  constructor(connection, connected) {
    super(truncateMiddle2(connection.name, 36), vscode3.TreeItemCollapsibleState.Collapsed);
    this.connection = connection;
    this.id = connection.id;
    this.description = `${connected ? "online" : "offline"} | ${connection.type}`;
    this.contextValue = "connection";
    this.iconPath = new vscode3.ThemeIcon(
      "database",
      new vscode3.ThemeColor(connected ? "testing.iconPassed" : "descriptionForeground")
    );
    this.tooltip = new vscode3.MarkdownString(
      [
        `**${connection.name}**`,
        "",
        `Type: ${connection.type}`,
        `Host: ${connection.host}:${connection.port}`,
        `Database: ${connection.database}`,
        `User: ${connection.username}`,
        `Schema: ${connection.defaultSchema ?? "public"}`,
        `Status: ${connected ? "connected" : "disconnected"}`
      ].join("\n\n")
    );
  }
  kind = "connection";
};
var CatalogNode = class extends vscode3.TreeItem {
  constructor(connection) {
    super(truncateMiddle2(connection.database, 40), vscode3.TreeItemCollapsibleState.Collapsed);
    this.connection = connection;
    this.id = `catalog:${connection.id}:${connection.database}`;
    this.description = connection.host;
    this.contextValue = "catalog";
    this.iconPath = new vscode3.ThemeIcon("server-environment");
    this.tooltip = `${connection.database} on ${connection.host}:${connection.port}`;
  }
  kind = "catalog";
};
var SchemasNode = class extends vscode3.TreeItem {
  constructor(connection) {
    super("Schemas", vscode3.TreeItemCollapsibleState.Collapsed);
    this.connection = connection;
    this.id = `schemas:${connection.id}`;
    this.contextValue = "schemas";
    this.iconPath = new vscode3.ThemeIcon("library");
  }
  kind = "schemas";
};
var SchemaNode = class extends vscode3.TreeItem {
  constructor(connection, schema) {
    super(truncateMiddle2(schema.name, 40), vscode3.TreeItemCollapsibleState.Collapsed);
    this.connection = connection;
    this.schema = schema;
    this.id = `schema:${connection.id}:${schema.name}`;
    this.contextValue = "schema";
    this.iconPath = new vscode3.ThemeIcon("library");
    this.tooltip = schema.name;
  }
  kind = "schema";
};
var FolderNode = class extends vscode3.TreeItem {
  constructor(connection, schema, folder, tableName) {
    super(folder, vscode3.TreeItemCollapsibleState.Collapsed);
    this.connection = connection;
    this.schema = schema;
    this.folder = folder;
    this.tableName = tableName;
    this.id = `folder:${connection.id}:${schema}:${folder}:${tableName ?? ""}`;
    this.contextValue = folder.toLowerCase().replace(/\s+/g, "-");
    this.iconPath = new vscode3.ThemeIcon(folder === "Materialized Views" ? "symbol-structure" : "folder");
  }
  kind = "folder";
};
var TableNode = class extends vscode3.TreeItem {
  constructor(connection, table) {
    super(truncateMiddle2(table.name, 48), vscode3.TreeItemCollapsibleState.Collapsed);
    this.connection = connection;
    this.table = table;
    this.id = `table:${connection.id}:${table.schema}:${table.name}`;
    this.description = table.rowEstimate !== void 0 ? `~${table.rowEstimate}` : void 0;
    this.contextValue = "table";
    this.iconPath = new vscode3.ThemeIcon(table.type === "materialized_view" ? "symbol-structure" : "table");
    this.tooltip = table.comment ? `${table.schema}.${table.name}
${table.comment}` : `${table.schema}.${table.name}`;
    this.command = { command: "database.openTableData", title: "Open Table Data", arguments: [this] };
  }
  kind = "table";
};
var ViewNode = class extends vscode3.TreeItem {
  constructor(connection, view) {
    super(truncateMiddle2(view.name, 48), vscode3.TreeItemCollapsibleState.None);
    this.connection = connection;
    this.view = view;
    this.id = `view:${connection.id}:${view.schema}:${view.name}`;
    this.contextValue = "view";
    this.iconPath = new vscode3.ThemeIcon("eye");
    this.tooltip = `${view.schema}.${view.name}`;
  }
  kind = "view";
};
var ColumnNode = class extends vscode3.TreeItem {
  constructor(connection, column) {
    super(truncateMiddle2(column.name, 44), vscode3.TreeItemCollapsibleState.None);
    this.connection = connection;
    this.column = column;
    this.id = `column:${connection.id}:${column.schema}:${column.table}:${column.name}`;
    this.description = truncateEnd(`${column.dataType}${column.nullable ? "" : " not null"}`, 30);
    this.contextValue = "column";
    this.iconPath = new vscode3.ThemeIcon(column.name.toLowerCase() === "id" ? "key" : "symbol-field");
    this.tooltip = `${column.schema}.${column.table}.${column.name}
${column.dataType}${column.nullable ? "" : " not null"}`;
  }
  kind = "column";
};
function truncateMiddle2(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  const keep = Math.max(4, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}
function truncateEnd(value, maxLength) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

// src/explorer/DatabaseTreeProvider.ts
var DatabaseTreeProvider = class {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
  }
  emitter = new vscode4.EventEmitter();
  onDidChangeTreeData = this.emitter.event;
  refresh(node) {
    this.emitter.fire(node);
  }
  getTreeItem(element) {
    return element;
  }
  async getChildren(element) {
    if (!element) {
      return this.connectionManager.getConnections().map((connection) => new ConnectionNode(connection, this.connectionManager.isConnected(connection.id)));
    }
    if (element instanceof ConnectionNode) {
      return [new CatalogNode(element.connection)];
    }
    if (element instanceof CatalogNode) {
      await this.ensureConnected(element.connection.id);
      const schemas = await this.connectionManager.getDriver(element.connection.type).getSchemas(element.connection.id);
      return schemas.map((schema) => new SchemaNode(element.connection, schema));
    }
    if (element instanceof SchemasNode) {
      await this.ensureConnected(element.connection.id);
      const schemas = await this.connectionManager.getDriver(element.connection.type).getSchemas(element.connection.id);
      return schemas.map((schema) => new SchemaNode(element.connection, schema));
    }
    if (element instanceof SchemaNode) {
      return [
        new FolderNode(element.connection, element.schema.name, "Tables"),
        new FolderNode(element.connection, element.schema.name, "Materialized Views"),
        new FolderNode(element.connection, element.schema.name, "Views")
      ];
    }
    if (element instanceof FolderNode && element.folder === "Tables") {
      await this.ensureConnected(element.connection.id);
      const tables = await this.connectionManager.getDriver(element.connection.type).getTables(element.connection.id, element.schema);
      return tables.filter((table) => table.type !== "materialized_view").map((table) => new TableNode(element.connection, table));
    }
    if (element instanceof FolderNode && element.folder === "Materialized Views") {
      await this.ensureConnected(element.connection.id);
      const tables = await this.connectionManager.getDriver(element.connection.type).getTables(element.connection.id, element.schema);
      return tables.filter((table) => table.type === "materialized_view").map((table) => new TableNode(element.connection, table));
    }
    if (element instanceof FolderNode && element.folder === "Views") {
      await this.ensureConnected(element.connection.id);
      const views = await this.connectionManager.getDriver(element.connection.type).getViews(element.connection.id, element.schema);
      return views.map((view) => new ViewNode(element.connection, view));
    }
    if (element instanceof TableNode) {
      return [
        new FolderNode(element.connection, element.table.schema, "Columns", element.table.name)
      ];
    }
    if (element instanceof FolderNode && element.folder === "Columns") {
      const table = element.tableName;
      if (!table) {
        return [];
      }
      const columns = await this.connectionManager.getDriver(element.connection.type).getColumns(element.connection.id, element.schema, table);
      return columns.map((column) => new ColumnNode(element.connection, column));
    }
    return [];
  }
  async ensureConnected(connectionId) {
    if (!this.connectionManager.isConnected(connectionId)) {
      await this.connectionManager.connect(connectionId);
    }
  }
};

// src/persistence/connectionStore.ts
var CONNECTIONS_KEY = "database.connections";
var SELECTED_CONNECTION_KEY = "database.selectedConnectionId";
var ConnectionStore = class {
  constructor(context) {
    this.context = context;
  }
  getAll() {
    return this.context.globalState.get(CONNECTIONS_KEY, []);
  }
  async save(config) {
    const { password, ...metadata } = config;
    const connections = this.getAll().filter((item) => item.id !== config.id);
    connections.push(metadata);
    await this.context.globalState.update(CONNECTIONS_KEY, connections.sort((a, b) => a.name.localeCompare(b.name)));
    if (password !== void 0) {
      await this.context.secrets.store(this.secretKey(config.id), password);
    }
  }
  async delete(id) {
    await this.context.globalState.update(CONNECTIONS_KEY, this.getAll().filter((item) => item.id !== id));
    await this.context.secrets.delete(this.secretKey(id));
  }
  async withPassword(config) {
    return { ...config, password: await this.context.secrets.get(this.secretKey(config.id)) };
  }
  getSelectedConnectionId() {
    return this.context.workspaceState.get(SELECTED_CONNECTION_KEY);
  }
  async setSelectedConnectionId(id) {
    await this.context.workspaceState.update(SELECTED_CONNECTION_KEY, id);
  }
  secretKey(id) {
    return `database.connection.${id}.password`;
  }
};

// src/persistence/queryConsoleStore.ts
var vscode5 = __toESM(require("vscode"));

// src/persistence/queryConsoleRecords.ts
async function partitionExistingConsoleRecords(records, documentExists) {
  const existing = [];
  const missing = [];
  for (const record of records) {
    if (await documentExists(record.documentUri)) {
      existing.push(record);
    } else {
      missing.push(record);
    }
  }
  return { existing, missing };
}

// src/persistence/queryConsoleStore.ts
var CONSOLES_KEY = "database.queryConsoles";
var QueryConsoleStore = class {
  constructor(context) {
    this.context = context;
  }
  getAll() {
    return this.context.workspaceState.get(CONSOLES_KEY, []);
  }
  async pruneMissingDocuments() {
    const records = this.getAll();
    const { existing, missing } = await partitionExistingConsoleRecords(
      records,
      (documentUri) => this.documentExists(documentUri)
    );
    if (missing.length) {
      await this.context.workspaceState.update(CONSOLES_KEY, existing);
    }
    return missing.length;
  }
  getByConnection(connectionId) {
    return this.getAll().filter((record) => record.connectionId === connectionId).sort((a, b) => (b.lastTouchedAt ?? b.updatedAt) - (a.lastTouchedAt ?? a.updatedAt))[0];
  }
  async openOrCreate(connection, initialSql = "", options = {}) {
    const reuse = options.reuse ?? true;
    const existing = reuse && connection ? this.getByConnection(connection.id) : void 0;
    if (existing) {
      try {
        const document = await vscode5.workspace.openTextDocument(vscode5.Uri.parse(existing.documentUri));
        await this.touch(existing.id, { opened: true });
        return document;
      } catch {
        await this.delete(existing.id);
      }
    }
    const uri = await this.createConsoleUri(connection);
    await this.ensureFile(uri, initialSql || this.defaultContent(connection, uri));
    const now = Date.now();
    if (connection) {
      await this.save({
        id: createId("console"),
        connectionId: connection.id,
        documentUri: uri.toString(),
        schemaName: connection.defaultSchema,
        sortOrder: -now,
        lastOpenedAt: now,
        lastTouchedAt: now,
        createdAt: now,
        updatedAt: now
      });
    }
    return vscode5.workspace.openTextDocument(uri);
  }
  async markExecuted(documentUri, range) {
    const records = this.getAll();
    const index = records.findIndex((record) => record.documentUri === documentUri);
    if (index === -1) {
      return;
    }
    const now = Date.now();
    records[index] = { ...records[index], lastExecutedRange: range, lastTouchedAt: now, updatedAt: now };
    await this.context.workspaceState.update(CONSOLES_KEY, records);
  }
  async touch(id, options = {}) {
    const now = Date.now();
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().map((record) => record.id === id ? { ...record, lastOpenedAt: options.opened ? now : record.lastOpenedAt, lastTouchedAt: now, updatedAt: now } : record));
  }
  async touchDocument(documentUri, options = {}) {
    const record = this.getAll().find((item) => item.documentUri === documentUri);
    if (record) {
      await this.touch(record.id, options);
    }
  }
  async setPinned(id, pinned) {
    const now = Date.now();
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().map((record) => record.id === id ? { ...record, pinned, updatedAt: now } : record));
  }
  async move(id, direction) {
    const records = this.getAll();
    const record = records.find((item) => item.id === id);
    if (!record) {
      return;
    }
    const siblings = records.filter((item) => item.connectionId === record.connectionId).sort((a, b) => this.sortValue(a) - this.sortValue(b));
    const index = siblings.findIndex((item) => item.id === id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    const swap = siblings[swapIndex];
    if (index === -1 || !swap) {
      return;
    }
    const firstOrder = this.sortValue(record);
    const secondOrder = this.sortValue(swap);
    const now = Date.now();
    await this.context.workspaceState.update(CONSOLES_KEY, records.map((item) => {
      if (item.id === record.id) {
        return { ...item, sortOrder: secondOrder, updatedAt: now };
      }
      if (item.id === swap.id) {
        return { ...item, sortOrder: firstOrder, updatedAt: now };
      }
      return item;
    }));
  }
  async delete(id) {
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().filter((record) => record.id !== id));
  }
  async deleteMany(ids) {
    const idSet = new Set(ids);
    if (!idSet.size) {
      return;
    }
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().filter((record) => !idSet.has(record.id)));
  }
  async save(record) {
    const records = this.getAll().filter((existing) => existing.id !== record.id);
    records.push(record);
    await this.context.workspaceState.update(CONSOLES_KEY, records);
  }
  sortValue(record) {
    return record.sortOrder ?? -(record.lastTouchedAt ?? record.updatedAt);
  }
  async createConsoleUri(connection) {
    const folder = vscode5.workspace.workspaceFolders?.[0]?.uri;
    const base = folder ? vscode5.Uri.joinPath(folder, ".vscode-data-grip") : vscode5.Uri.joinPath(this.context.globalStorageUri, "query-consoles");
    await vscode5.workspace.fs.createDirectory(base);
    const name = this.safeName(connection ? `${connection.name}-${connection.database}` : "sql-console");
    const existing = new Set(this.getAll().map((record) => record.documentUri));
    for (let index = 1; index < 1e4; index += 1) {
      const suffix = index === 1 ? "" : `-${index}`;
      const uri = vscode5.Uri.joinPath(base, `${name}${suffix}.sql`);
      if (!existing.has(uri.toString())) {
        try {
          await vscode5.workspace.fs.stat(uri);
        } catch {
          return uri;
        }
      }
    }
    return vscode5.Uri.joinPath(base, `${name}-${Date.now()}.sql`);
  }
  async ensureFile(uri, content) {
    try {
      await vscode5.workspace.fs.stat(uri);
    } catch {
      await vscode5.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
      if (!vscode5.workspace.workspaceFolders?.length) {
        void vscode5.window.showInformationMessage("No workspace is open. Query console files are stored in extension storage; SQL autocomplete still works after metadata warms.");
      }
    }
  }
  defaultContent(connection, uri) {
    return connection ? `-- ${connection.name} / ${connection.database}
-- Schema: ${connection.defaultSchema ?? "public"}

select *
from 
limit 100;
` : `-- SQL Console

`;
  }
  safeName(value) {
    return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "sql-console";
  }
  async documentExists(documentUri) {
    try {
      await vscode5.workspace.fs.stat(vscode5.Uri.parse(documentUri));
      return true;
    } catch (error) {
      return !this.isFileNotFound(error);
    }
  }
  isFileNotFound(error) {
    const code = error instanceof vscode5.FileSystemError ? error.code : typeof error === "object" && error !== null ? error.code : void 0;
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    return code === "FileNotFound" || /\b(FileNotFound|ENOENT)\b/i.test(message);
  }
};

// src/persistence/sqlDocumentConnectionStore.ts
var SQL_DOCUMENT_CONNECTIONS_KEY = "database.sqlDocumentConnections";
var MAX_SQL_DOCUMENT_CONNECTIONS = 500;
var SqlDocumentConnectionStore = class {
  constructor(context) {
    this.context = context;
  }
  getAll() {
    return this.context.workspaceState.get(SQL_DOCUMENT_CONNECTIONS_KEY, []);
  }
  get(documentUri) {
    return this.getAll().find((record) => record.documentUri === documentUri);
  }
  async set(documentUri, connectionId) {
    const existing = this.get(documentUri);
    const records = this.getAll().filter((record) => record.documentUri !== documentUri);
    records.push({ ...existing, documentUri, connectionId, updatedAt: Date.now() });
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      records.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SQL_DOCUMENT_CONNECTIONS)
    );
  }
  async markExecuted(documentUri, connectionId, range) {
    const now = Date.now();
    const existing = this.get(documentUri);
    const records = this.getAll().filter((record) => record.documentUri !== documentUri);
    records.push({
      ...existing,
      documentUri,
      connectionId,
      lastExecutedRange: range,
      lastTouchedAt: now,
      updatedAt: now
    });
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      records.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SQL_DOCUMENT_CONNECTIONS)
    );
  }
  async touch(documentUri) {
    const now = Date.now();
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      this.getAll().map((record) => record.documentUri === documentUri ? { ...record, lastTouchedAt: now, updatedAt: now } : record)
    );
  }
  async delete(documentUri) {
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      this.getAll().filter((record) => record.documentUri !== documentUri)
    );
  }
  async deleteMany(documentUris) {
    const uriSet = new Set(documentUris);
    if (!uriSet.size) {
      return;
    }
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      this.getAll().filter((record) => !uriSet.has(record.documentUri))
    );
  }
};

// src/persistence/queryHistoryStore.ts
var vscode6 = __toESM(require("vscode"));
var HISTORY_KEY = "database.queryHistory";
var QueryHistoryStore = class {
  constructor(context) {
    this.context = context;
  }
  getAll() {
    return this.context.workspaceState.get(HISTORY_KEY, []);
  }
  async add(item) {
    const maxItems = vscode6.workspace.getConfiguration("database").get("history.maxItems", 1e3);
    const history = [item, ...this.getAll().filter((existing) => existing.id !== item.id)].slice(0, maxItems);
    await this.context.workspaceState.update(HISTORY_KEY, history);
  }
  async update(item) {
    await this.context.workspaceState.update(HISTORY_KEY, this.getAll().map((existing) => existing.id === item.id ? item : existing));
  }
  async delete(id) {
    await this.context.workspaceState.update(HISTORY_KEY, this.getAll().filter((item) => item.id !== id));
  }
  async deleteMany(ids) {
    const idSet = new Set(ids);
    if (!idSet.size) {
      return;
    }
    await this.context.workspaceState.update(HISTORY_KEY, this.getAll().filter((item) => !idSet.has(item.id)));
  }
};

// src/persistence/queryMemoryStore.ts
var vscode7 = __toESM(require("vscode"));
var MEMORY_KEY = "database.queryMemory";
var QueryMemoryStore = class {
  constructor(context) {
    this.context = context;
  }
  getAll() {
    return this.context.workspaceState.get(MEMORY_KEY, []);
  }
  get(id) {
    return this.getAll().find((item) => item.id === id);
  }
  async upsert(item) {
    const maxItems = vscode7.workspace.getConfiguration("database").get("queryMemory.maxItems", 2e3);
    const next = [item, ...this.getAll().filter((existing) => existing.id !== item.id)].sort((a, b) => (b.executedAt ?? b.updatedAt) - (a.executedAt ?? a.updatedAt)).slice(0, Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : 2e3);
    await this.context.workspaceState.update(MEMORY_KEY, next);
  }
  async update(id, patch) {
    const now = Date.now();
    await this.context.workspaceState.update(MEMORY_KEY, this.getAll().map((item) => item.id === id ? { ...item, ...patch, updatedAt: now } : item));
  }
  async delete(id) {
    await this.context.workspaceState.update(MEMORY_KEY, this.getAll().filter((item) => item.id !== id));
  }
  async deleteMany(ids) {
    const idSet = new Set(ids);
    if (!idSet.size) {
      return;
    }
    await this.context.workspaceState.update(MEMORY_KEY, this.getAll().filter((item) => !idSet.has(item.id)));
  }
};

// src/persistence/resultSessionStore.ts
var vscode8 = __toESM(require("vscode"));
var TABS_KEY = "database.resultTabs";
var ResultSessionStore = class {
  constructor(context) {
    this.context = context;
  }
  getTabs() {
    return this.context.workspaceState.get(TABS_KEY, []);
  }
  async saveTabs(tabs) {
    const persistPinned = vscode8.workspace.getConfiguration("database").get("resultTabs.persistPinned", true);
    const persisted = persistPinned ? tabs.filter((tab) => tab.pinned && !["queued", "running"].includes(tab.executionStatus)).map((tab) => ({
      ...tab,
      resultSets: tab.resultSets.map((set) => set.rows.length <= 1e3 ? set : { ...set, rows: [], rowCount: set.rowCount })
    })) : [];
    await this.context.workspaceState.update(TABS_KEY, persisted);
  }
};

// src/persistence/orphanedConnectionRecords.ts
function orphanedConnectionRecordIds(records, connectionIds) {
  const knownConnectionIds = new Set(connectionIds);
  const historyIds = records.history.filter((item) => !knownConnectionIds.has(item.connectionId)).map((item) => item.id);
  const orphanedHistoryIds = new Set(historyIds);
  return {
    consoleIds: records.consoles.filter((record) => !knownConnectionIds.has(record.connectionId)).map((record) => record.id),
    sqlDocumentUris: records.sqlDocuments.filter((record) => !knownConnectionIds.has(record.connectionId)).map((record) => record.documentUri),
    historyIds,
    memoryIds: records.memory.filter((item) => {
      if (item.connectionId && !knownConnectionIds.has(item.connectionId)) {
        return true;
      }
      if (item.latestHistoryId && orphanedHistoryIds.has(item.latestHistoryId)) {
        return true;
      }
      return item.historyIds?.some((id) => orphanedHistoryIds.has(id)) === true;
    }).map((item) => item.id)
  };
}

// src/services/queryMemoryService.ts
var vscode9 = __toESM(require("vscode"));

// src/services/queryMemorySearch.ts
var QueryMemorySearch = class {
  constructor(safety = new SqlSafetyClassifier()) {
    this.safety = safety;
  }
  search(items, request) {
    const terms = this.terms(request.query);
    const limit = request.limit && request.limit > 0 ? request.limit : 20;
    return items.filter((item) => this.matchesFilters(item, request)).map((item) => this.score(item, terms)).filter((result) => request.query.trim().length === 0 || result.score > 0).sort((a, b) => b.score - a.score || (b.item.executedAt ?? b.item.updatedAt) - (a.item.executedAt ?? a.item.updatedAt)).slice(0, limit);
  }
  matchesFilters(item, request) {
    if (request.connectionId && item.connectionId !== request.connectionId) {
      return false;
    }
    if (!request.includeFailed && item.status === "failed") {
      return false;
    }
    return true;
  }
  score(item, terms) {
    const reasons = [];
    let score = 0;
    const fields = [
      ["title", item.title ?? "", 12],
      ["summary", item.summary ?? "", 8],
      ["sql", item.sql, 5],
      ["source", item.sourceFile ?? item.documentUri ?? "", 4],
      ["connection", `${item.connectionName ?? ""} ${item.databaseName ?? ""}`, 3],
      ["status", item.status ?? "", 2]
    ];
    const arrays = [
      ["table", item.tables, 10],
      ["column", item.columns, 7],
      ["output column", item.outputColumns, 9]
    ];
    for (const term of terms) {
      for (const [name, value, weight] of fields) {
        if (this.includes(value, term)) {
          score += weight;
          reasons.push(`${name}: ${term}`);
        }
      }
      for (const [name, values, weight] of arrays) {
        if (values.some((value) => this.includes(value, term))) {
          score += weight;
          reasons.push(`${name}: ${term}`);
        }
      }
    }
    if (item.favorite) {
      score += 5;
      reasons.push("favorite");
    }
    if (item.executedAt && Date.now() - item.executedAt < 7 * 24 * 60 * 60 * 1e3) {
      score += 2;
      reasons.push("recent");
    }
    return {
      item,
      score,
      reasons: [...new Set(reasons)].slice(0, 6),
      safety: this.safety.classify(item.sql)
    };
  }
  terms(query) {
    return [...new Set(query.toLowerCase().split(/[^a-z0-9_.$"]+/).map((term) => term.replace(/^"|"$/g, "")).filter((term) => term.length >= 2))];
  }
  includes(value, term) {
    return value.toLowerCase().includes(term);
  }
};

// src/services/queryConsoleHistory.ts
function queryConsoleDocumentUris(records) {
  return new Set(records.map((record) => record.documentUri));
}
function executionOriginForDocument(documentUri, consoleDocumentUris) {
  return documentUri && consoleDocumentUris.has(documentUri) ? "queryConsole" : "sqlFile";
}
function isQueryConsoleHistoryItem(item, consoleDocumentUris) {
  if (item.sourceOrigin) {
    return item.sourceOrigin === "queryConsole";
  }
  return item.documentUri !== void 0 && (consoleDocumentUris.has(item.documentUri) || isLegacyQueryConsoleDocumentUri(item.documentUri));
}
function isQueryConsoleMemoryItem(item, consoleDocumentUris) {
  return item.documentUri !== void 0 && (consoleDocumentUris.has(item.documentUri) || isLegacyQueryConsoleDocumentUri(item.documentUri));
}
function isLegacyQueryConsoleDocumentUri(documentUri) {
  const normalized = documentUri.toLowerCase().replace(/\\/g, "/");
  return normalized.includes("/.vscode-data-grip/") || normalized.includes("/query-consoles/");
}

// src/services/queryMemoryService.ts
var QueryMemoryService = class {
  constructor(historyStore, memoryStore, consoleStore, connectionManager, summarizer) {
    this.historyStore = historyStore;
    this.memoryStore = memoryStore;
    this.consoleStore = consoleStore;
    this.connectionManager = connectionManager;
    this.summarizer = summarizer;
  }
  searcher = new QueryMemorySearch();
  getAll() {
    return this.memoryStore.getAll();
  }
  async recordHistoryItem(item) {
    const id = this.historyMemoryId(item);
    const existing = this.memoryStore.get(id);
    if (existing?.historyIds?.includes(item.id)) {
      return;
    }
    await this.memoryStore.upsert(this.fromHistory(item, existing));
    const legacyId = this.legacyHistoryMemoryId(item);
    if (legacyId !== id) {
      await this.memoryStore.delete(legacyId);
    }
  }
  async search(request) {
    await this.syncFromHistory();
    await this.syncKnownDocuments();
    return this.searcher.search(this.queryConsoleMemoryItems(), request);
  }
  async backfillSummaries(options = {}) {
    const limit = options.limit && options.limit > 0 ? options.limit : 25;
    const result = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    if (!this.summarizer) {
      return { ...result, skipped: limit };
    }
    const candidates = this.memoryStore.getAll().filter((item) => item.summaryStatus !== "ready").slice(0, limit);
    for (const item of candidates) {
      if (options.token?.isCancellationRequested) {
        break;
      }
      result.processed += 1;
      if (!item.sql.trim()) {
        result.skipped += 1;
        await this.memoryStore.update(item.id, { summaryStatus: "skipped", summaryError: "Empty SQL." });
        continue;
      }
      try {
        await this.memoryStore.update(item.id, { summaryStatus: "pending", summaryError: void 0 });
        const summary = await this.summarizer.summarizeQueryMemory({
          sql: item.sql,
          connectionName: item.connectionName,
          databaseName: item.databaseName,
          databaseType: item.databaseType,
          outputColumns: item.outputColumns,
          errorMessage: item.errorMessage
        });
        await this.memoryStore.update(item.id, {
          title: summary.title,
          summary: summary.summary,
          tables: summary.tables.length ? summary.tables : item.tables,
          columns: summary.columns.length ? summary.columns : item.columns,
          summaryStatus: "ready",
          summaryError: void 0
        });
        result.succeeded += 1;
      } catch (error) {
        await this.memoryStore.update(item.id, {
          summaryStatus: "failed",
          summaryError: error instanceof Error ? error.message : String(error)
        });
        result.failed += 1;
      }
    }
    return result;
  }
  async syncFromHistory() {
    for (const item of this.queryConsoleHistoryItems()) {
      await this.recordHistoryItem(item);
    }
  }
  async syncKnownDocuments() {
    const documentUris = /* @__PURE__ */ new Set();
    for (const record of this.consoleStore.getAll()) {
      documentUris.add(record.documentUri);
    }
    for (const documentUri of documentUris) {
      await this.indexDocument(documentUri);
    }
  }
  async indexDocument(documentUri) {
    let sql = "";
    try {
      const bytes = await vscode9.workspace.fs.readFile(vscode9.Uri.parse(documentUri));
      sql = Buffer.from(bytes).toString("utf8");
    } catch {
      return;
    }
    if (!sql.trim()) {
      return;
    }
    const id = this.documentMemoryId(documentUri);
    const existing = this.memoryStore.get(id);
    const now = Date.now();
    await this.memoryStore.upsert({
      id,
      sourceKind: "document",
      sourceId: documentUri,
      sql,
      title: existing?.title,
      summary: existing?.summary,
      summaryStatus: existing?.summaryStatus ?? "pending",
      summaryError: existing?.summaryError,
      tables: extractQueryTables(sql),
      columns: extractQualifiedColumns(sql),
      outputColumns: [],
      documentUri,
      sourceFile: this.fsPath(documentUri),
      indexedAt: existing?.indexedAt ?? now,
      updatedAt: now
    });
  }
  fromHistory(item, existing) {
    const connection = this.connectionManager.getConnection(item.connectionId);
    const now = Date.now();
    const lastExecutedAt = Math.max(existing?.lastExecutedAt ?? existing?.executedAt ?? 0, item.executedAt);
    const isLatest = item.executedAt >= (existing?.lastExecutedAt ?? existing?.executedAt ?? 0);
    return {
      id: this.historyMemoryId(item),
      sourceKind: "history",
      sourceId: this.historyFingerprint(item),
      connectionId: item.connectionId,
      databaseType: item.databaseType,
      databaseName: connection?.database,
      connectionName: connection?.name,
      sql: item.sql,
      title: existing?.title ?? item.memoryTitle,
      summary: existing?.summary ?? item.memorySummary,
      summaryStatus: existing?.summaryStatus ?? item.memorySummaryStatus ?? "pending",
      summaryError: existing?.summaryError ?? item.memorySummaryError,
      tables: this.mergeStrings(existing?.tables, item.tables?.length ? item.tables : extractQueryTables(item.sql)),
      columns: this.mergeStrings(existing?.columns, item.columns?.length ? item.columns : extractQualifiedColumns(item.sql)),
      outputColumns: this.mergeStrings(existing?.outputColumns, item.outputColumns ?? []),
      sourceFile: isLatest ? item.sourceFile : existing?.sourceFile,
      documentUri: isLatest ? item.documentUri : existing?.documentUri,
      sourceRange: isLatest ? item.sourceRange : existing?.sourceRange,
      favorite: existing?.favorite || item.favorite,
      status: isLatest ? item.status : existing?.status,
      errorMessage: isLatest ? item.errorMessage : existing?.errorMessage,
      rowCount: isLatest ? item.rowCount : existing?.rowCount,
      durationMs: isLatest ? item.durationMs : existing?.durationMs,
      executedAt: lastExecutedAt,
      firstExecutedAt: Math.min(existing?.firstExecutedAt ?? existing?.executedAt ?? item.executedAt, item.executedAt),
      lastExecutedAt,
      runCount: (existing?.runCount ?? existing?.historyIds?.length ?? 0) + 1,
      historyIds: [...existing?.historyIds ?? [], item.id],
      latestHistoryId: isLatest ? item.id : existing?.latestHistoryId,
      indexedAt: existing?.indexedAt ?? now,
      updatedAt: now
    };
  }
  queryConsoleHistoryItems() {
    const consoleUris = queryConsoleDocumentUris(this.consoleStore.getAll());
    return this.historyStore.getAll().filter((item) => isQueryConsoleHistoryItem(item, consoleUris));
  }
  queryConsoleMemoryItems() {
    const consoleUris = queryConsoleDocumentUris(this.consoleStore.getAll());
    return this.memoryStore.getAll().filter((item) => isQueryConsoleMemoryItem(item, consoleUris));
  }
  historyMemoryId(item) {
    return `memory_${this.hash(this.historyFingerprint(item))}`;
  }
  legacyHistoryMemoryId(item) {
    return `memory_${item.id}`;
  }
  historyFingerprint(item) {
    return `${item.connectionId}:${this.normalizeSql(item.sql)}`;
  }
  normalizeSql(sql) {
    return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim().replace(/;+$/g, "").toLowerCase();
  }
  mergeStrings(first = [], second = []) {
    return [...new Set([...first, ...second].filter(Boolean))];
  }
  documentMemoryId(documentUri) {
    return `memory_doc_${this.hash(documentUri)}`;
  }
  hash(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(index) | 0;
    }
    return Math.abs(hash).toString(36);
  }
  fsPath(documentUri) {
    try {
      return vscode9.Uri.parse(documentUri).fsPath;
    } catch {
      return void 0;
    }
  }
};

// src/services/schemaMetadataCacheStore.ts
var crypto = __toESM(require("crypto"));
var vscode10 = __toESM(require("vscode"));
var SCHEMA_METADATA_CACHE_VERSION = 1;
var SchemaMetadataCacheStore = class {
  baseUri;
  storageError;
  constructor(context) {
    this.baseUri = vscode10.Uri.joinPath(context.globalStorageUri, "schema-metadata-cache");
  }
  getStorageError() {
    return this.storageError;
  }
  async hydrate(connection, schemaName) {
    try {
      const uri = this.cacheUri(connection, schemaName);
      const bytes = await vscode10.workspace.fs.readFile(uri);
      const stored = parseStoredSchemaCacheEntry(connection, Buffer.from(bytes).toString("utf8"));
      if (!stored || stored.entry.schemaName !== schemaName) {
        return void 0;
      }
      this.storageError = void 0;
      return { ...stored.entry, source: "disk" };
    } catch (error) {
      if (!this.isNotFound(error)) {
        this.storageError = error instanceof Error ? error.message : String(error);
      }
      return void 0;
    }
  }
  async persist(connection, entry) {
    try {
      await vscode10.workspace.fs.createDirectory(this.connectionCacheUri(connection));
      await vscode10.workspace.fs.writeFile(
        this.cacheUri(connection, entry.schemaName),
        Buffer.from(serializeSchemaCacheEntry(connection, entry), "utf8")
      );
      this.storageError = void 0;
    } catch (error) {
      this.storageError = error instanceof Error ? error.message : String(error);
    }
  }
  async deleteConnection(connectionId) {
    try {
      await vscode10.workspace.fs.delete(vscode10.Uri.joinPath(this.baseUri, safePath(connectionId)), { recursive: true, useTrash: false });
      this.storageError = void 0;
    } catch (error) {
      if (!this.isNotFound(error)) {
        this.storageError = error instanceof Error ? error.message : String(error);
      }
    }
  }
  connectionCacheUri(connection) {
    return vscode10.Uri.joinPath(this.baseUri, safePath(connection.id), connectionMetadataFingerprint(connection));
  }
  cacheUri(connection, schemaName) {
    return vscode10.Uri.joinPath(this.connectionCacheUri(connection), `${safePath(schemaName)}.json`);
  }
  isNotFound(error) {
    const code = error instanceof vscode10.FileSystemError ? error.code : typeof error === "object" && error !== null ? error.code : void 0;
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    return code === "FileNotFound" || /\b(FileNotFound|ENOENT)\b/i.test(message);
  }
};
function connectionMetadataFingerprint(connection) {
  const identity = {
    type: connection.type,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.username,
    sslMode: connection.sslMode,
    defaultSchema: connection.defaultSchema ?? "public"
  };
  return crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 16);
}
function serializeSchemaCacheEntry(connection, entry) {
  const fingerprint = connectionMetadataFingerprint(connection);
  const stored = {
    version: SCHEMA_METADATA_CACHE_VERSION,
    fingerprint,
    savedAt: Date.now(),
    entry: {
      ...entry,
      cacheVersion: SCHEMA_METADATA_CACHE_VERSION,
      connectionFingerprint: fingerprint,
      source: "disk"
    }
  };
  return `${JSON.stringify(stored)}
`;
}
function parseStoredSchemaCacheEntry(connection, raw) {
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (stored.version !== SCHEMA_METADATA_CACHE_VERSION || stored.fingerprint !== connectionMetadataFingerprint(connection)) {
    return void 0;
  }
  if (!stored.entry || stored.entry.connectionId !== connection.id) {
    return void 0;
  }
  return stored;
}
function safePath(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}

// src/services/schemaContextService.ts
var CACHE_TTL_MS = 5 * 6e4;
var REFRESH_DEBOUNCE_MS = 500;
var COLUMN_METADATA_WORKERS = 4;
var SchemaContextService = class {
  constructor(connectionManager, persistentCache) {
    this.connectionManager = connectionManager;
    this.persistentCache = persistentCache;
  }
  cache = /* @__PURE__ */ new Map();
  inflight = /* @__PURE__ */ new Map();
  refreshTimers = /* @__PURE__ */ new Map();
  async loadDefaultSchema(connection, refresh = false) {
    return this.loadSchema(connection, connection.defaultSchema ?? "public", refresh);
  }
  async loadSchema(connection, schemaName, refresh = false) {
    const key = this.key(connection, schemaName);
    const cached = this.markStale(this.cache.get(key));
    if (!refresh && cached && cached.status === "ready") {
      return cached;
    }
    if (this.inflight.has(key)) {
      return this.inflight.get(key);
    }
    if (!refresh && cached && !this.connectionManager.isConnected(connection.id)) {
      return cached;
    }
    if (!refresh && !cached) {
      const hydrated = await this.hydrateSchema(connection, schemaName);
      if (hydrated && !this.connectionManager.isConnected(connection.id)) {
        return hydrated;
      }
      if (hydrated && hydrated.status === "ready") {
        return hydrated;
      }
    }
    if (!this.connectionManager.isConnected(connection.id)) {
      const missing = this.emptyEntry(connection, schemaName, "error", "Connection is not active. Connect first to refresh metadata.");
      this.cache.set(key, missing);
      return missing;
    }
    const started = cached ? { ...cached, errorMessage: void 0 } : this.emptyEntry(connection, schemaName, "loading");
    if (!cached) {
      this.cache.set(key, started);
    }
    const load = this.loadSchemaNow(connection, schemaName, started).finally(() => this.inflight.delete(key));
    this.inflight.set(key, load);
    return load;
  }
  getCached(connectionId, schemaName) {
    const connection = this.connectionManager.getConnection(connectionId);
    const cached = connection ? this.cache.get(this.key(connection, schemaName)) : [...this.cache.values()].find((entry) => entry.connectionId === connectionId && entry.schemaName === schemaName);
    return this.markStale(cached);
  }
  async getCachedForConnection(connection, schemaName) {
    return this.markStale(this.cache.get(this.key(connection, schemaName))) ?? await this.hydrateSchema(connection, schemaName);
  }
  getAnyCached(connectionId) {
    return [...this.cache.values()].filter((entry) => entry.connectionId === connectionId).map((entry) => this.markStale(entry));
  }
  async getColumns(connection, schemaName, tableName) {
    const entry = await this.loadSchema(connection, schemaName);
    const tableKey = this.tableKey(schemaName, tableName);
    if (entry.columns[tableKey]) {
      return entry.columns[tableKey];
    }
    const columns = await this.connectionManager.getDriver(connection.type).getColumns(connection.id, schemaName, tableName);
    entry.columns[tableKey] = columns;
    entry.loadedAt = Date.now();
    entry.status = "ready";
    entry.source = "live";
    await this.persistentCache?.persist(connection, entry);
    return columns;
  }
  async getCachedColumns(connection, schemaName, tableName) {
    const entry = await this.getCachedForConnection(connection, schemaName);
    return entry?.columns[this.tableKey(schemaName, tableName)];
  }
  invalidate(connectionId, schemaName) {
    if (!connectionId) {
      this.cache.clear();
      return;
    }
    for (const [key, entry] of this.cache) {
      if (entry.connectionId === connectionId && (!schemaName || entry.schemaName === schemaName)) {
        this.cache.delete(key);
      }
    }
  }
  async deletePersistent(connectionId) {
    this.invalidate(connectionId);
    await this.persistentCache?.deleteConnection(connectionId);
  }
  async warmFromDisk(connections) {
    await Promise.all(connections.map((connection) => this.hydrateSchema(connection, connection.defaultSchema ?? "public")));
  }
  refreshDefaultSchemaInBackground(connection) {
    this.refreshSchemaInBackground(connection, connection.defaultSchema ?? "public");
  }
  refreshSchemaInBackground(connection, schemaName) {
    if (!this.connectionManager.isConnected(connection.id)) {
      return;
    }
    const key = this.key(connection, schemaName);
    const existing = this.refreshTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.refreshTimers.delete(key);
      void this.loadSchema(connection, schemaName, true);
    }, REFRESH_DEBOUNCE_MS);
    this.refreshTimers.set(key, timer);
  }
  async metadataStatus(connection, schemaName = connection.defaultSchema ?? "public") {
    const entry = await this.getCachedForConnection(connection, schemaName);
    return {
      connection,
      schemaName,
      entry,
      freshForDiagnostics: !!entry && entry.status === "ready",
      storageError: this.persistentCache?.getStorageError(),
      refreshRunning: this.inflight.has(this.key(connection, schemaName)),
      connected: this.connectionManager.isConnected(connection.id)
    };
  }
  tablesAndViews(connectionId) {
    return this.getAnyCached(connectionId).flatMap((entry) => [...entry.tables, ...entry.views]);
  }
  async loadSchemaNow(connection, schemaName, base) {
    try {
      const driver = this.connectionManager.getDriver(connection.type);
      const [schemas, tables, views] = await Promise.all([
        driver.getSchemas(connection.id),
        driver.getTables(connection.id, schemaName),
        driver.getViews(connection.id, schemaName)
      ]);
      const columns = await this.loadColumnsForRelations(connection, schemaName, [...tables, ...views]);
      const entry = {
        ...base,
        schemas,
        tables,
        views,
        columns,
        loadedAt: Date.now(),
        cacheVersion: SCHEMA_METADATA_CACHE_VERSION,
        connectionFingerprint: connectionMetadataFingerprint(connection),
        source: "live",
        status: "ready",
        errorMessage: void 0
      };
      this.cache.set(this.key(connection, schemaName), entry);
      await this.persistentCache?.persist(connection, entry);
      return entry;
    } catch (error) {
      const failed = {
        ...base,
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        loadedAt: Date.now()
      };
      this.cache.set(this.key(connection, schemaName), failed);
      return failed;
    }
  }
  async hydrateSchema(connection, schemaName) {
    const key = this.key(connection, schemaName);
    const hydrated = this.markStale(await this.persistentCache?.hydrate(connection, schemaName));
    if (hydrated) {
      this.cache.set(key, hydrated);
    }
    return hydrated;
  }
  async loadColumnsForRelations(connection, schemaName, relations) {
    const driver = this.connectionManager.getDriver(connection.type);
    const result = {};
    const queue = relations.filter((relation) => relation.schema === schemaName).slice(0, 300);
    const workers = Array.from({ length: Math.min(COLUMN_METADATA_WORKERS, queue.length) }, async () => {
      while (queue.length) {
        const relation = queue.shift();
        if (!relation) {
          return;
        }
        try {
          result[this.tableKey(relation.schema, relation.name)] = await driver.getColumns(connection.id, relation.schema, relation.name);
        } catch {
        }
      }
    });
    await Promise.all(workers);
    return result;
  }
  emptyEntry(connection, schemaName, status, errorMessage) {
    return {
      connectionId: connection.id,
      schemaName,
      cacheVersion: SCHEMA_METADATA_CACHE_VERSION,
      connectionFingerprint: connectionMetadataFingerprint(connection),
      source: "memory",
      schemas: [],
      tables: [],
      views: [],
      columns: {},
      indexes: {},
      keys: {},
      status,
      errorMessage
    };
  }
  markStale(entry) {
    if (!entry) {
      return void 0;
    }
    if (entry.loadedAt && Date.now() - entry.loadedAt > CACHE_TTL_MS && entry.status === "ready") {
      entry.status = "stale";
    }
    return entry;
  }
  key(connection, schemaName) {
    return `${connection.id}:${connectionMetadataFingerprint(connection)}:${schemaName}`;
  }
  tableKey(schemaName, tableName) {
    return `${schemaName}.${tableName}`;
  }
};

// src/services/sqlMetadataCompletion.ts
function relationCompletionContext(linePrefix) {
  const match = linePrefix.match(/\b(?:from|join|update|into)\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))(?:\.(?:"([^"]*)|([A-Za-z_][A-Za-z0-9_]*))?)?$/i);
  if (!match) {
    return void 0;
  }
  const hasQualifiedPrefix = match[1] !== void 0 || match[2] !== void 0;
  const schema = match[1] ?? match[2];
  const partial = match[3] ?? match[4] ?? "";
  return hasQualifiedPrefix && linePrefix.endsWith(".") || match[3] !== void 0 || match[4] !== void 0 ? { schema, partial } : { partial: schema };
}
function relationCompletionCandidates(entry, context) {
  const schema = context.schema?.toLowerCase();
  const partial = context.partial.toLowerCase();
  return [...entry.tables, ...entry.views].filter((relation) => {
    if (schema && relation.schema.toLowerCase() !== schema) {
      return false;
    }
    return relation.name.toLowerCase().startsWith(partial);
  });
}
function selectListColumnCompletionContext(statementPrefix) {
  const selectMatches = [...statementPrefix.matchAll(/\bselect\b/gi)];
  const lastSelect = selectMatches.at(-1);
  if (lastSelect?.index === void 0) {
    return false;
  }
  const afterSelect = statementPrefix.slice(lastSelect.index + lastSelect[0].length);
  return !/\b(?:from|where|join|left|right|inner|outer|full|cross|on|using|group|order|having|limit|union|intersect|except)\b/i.test(afterSelect);
}
function unqualifiedColumnCompletionContext(statementPrefix) {
  if (/\.\s*(?:"[^"]*|[A-Za-z_][A-Za-z0-9_]*)?$/.test(statementPrefix) || relationCompletionContext(statementPrefix)) {
    return false;
  }
  if (selectListColumnCompletionContext(statementPrefix)) {
    return true;
  }
  const relationIndex = lastKeywordIndex(statementPrefix, /\b(?:from|join|update|into)\b/gi);
  const columnIndex = lastKeywordIndex(statementPrefix, /\bwhere\b|\bhaving\b|\bon\b|\band\b|\bor\b|\bgroup\s+by\b|\border\s+by\b/gi);
  return columnIndex >= 0 && columnIndex > relationIndex;
}
function lastKeywordIndex(value, regex) {
  let index = -1;
  for (const match of value.matchAll(regex)) {
    if (match.index !== void 0) {
      index = match.index;
    }
  }
  return index;
}

// src/services/sqlMetadataWarmup.ts
async function connectAndRefreshSqlMetadata(connectionManager, schemaContext, connection) {
  let refreshConnection = connection;
  if (!connectionManager.isConnected(connection.id)) {
    const active = await connectionManager.connect(connection.id);
    refreshConnection = active.config;
  }
  schemaContext.refreshDefaultSchemaInBackground(refreshConnection);
}

// src/services/sqlDiagnosticsService.ts
var vscode11 = __toESM(require("vscode"));
var SQL_COLUMN_CONTEXT_KEYWORDS = /* @__PURE__ */ new Set([
  "all",
  "and",
  "as",
  "asc",
  "between",
  "by",
  "case",
  "cast",
  "date",
  "desc",
  "distinct",
  "else",
  "end",
  "false",
  "from",
  "group",
  "having",
  "in",
  "is",
  "like",
  "limit",
  "not",
  "null",
  "or",
  "order",
  "select",
  "then",
  "true",
  "when",
  "where"
]);
var SqlDiagnosticsService = class {
  constructor(connectionManager, schemaContext, sectionService) {
    this.connectionManager = connectionManager;
    this.schemaContext = schemaContext;
    this.sectionService = sectionService;
  }
  async getDiagnostics(document, selection, connectionOverride) {
    const diagnostics = [...this.sectionService.getSyntaxIssues(document)];
    const connection = connectionOverride === void 0 ? this.connectionManager.getPreferredConnection() : connectionOverride;
    if (!connection) {
      return diagnostics;
    }
    const scriptRelations = this.collectCreatedRelationNames(document);
    diagnostics.push(...await this.getSchemaDiagnostics(document, connection, scriptRelations));
    if (this.connectionManager.isConnected(connection.id)) {
      const executable = selection ? this.sectionService.detectExecutable(document, selection) : this.sectionService.getSections(document)[0];
      if (executable?.sql.trim()) {
        const plannerDiagnostic = await this.getPlannerDiagnostic(document, connection, executable, scriptRelations);
        if (plannerDiagnostic) {
          diagnostics.push(plannerDiagnostic);
        }
      }
    }
    return diagnostics;
  }
  async getSchemaDiagnostics(document, connection, scriptRelations) {
    const diagnostics = [];
    const defaultSchema = connection.defaultSchema ?? "public";
    const entry = await this.schemaContext.getCachedForConnection(connection, defaultSchema);
    if (!entry || entry.status !== "ready") {
      if (this.connectionManager.isConnected(connection.id)) {
        this.schemaContext.refreshDefaultSchemaInBackground(connection);
      }
      return diagnostics;
    }
    const knownRelations = new Set([...entry.tables, ...entry.views].map((item) => this.relationKey(item.schema, item.name)));
    const cteNames = this.collectCteNames(this.sectionService.getTree(document));
    for (const section of this.sectionService.getSections(document)) {
      for (const alias of section.aliases) {
        if (cteNames.has(alias.table.toLowerCase()) || this.isScriptRelation(alias, scriptRelations)) {
          continue;
        }
        const schema = alias.schema ?? defaultSchema;
        if (!knownRelations.has(this.relationKey(schema, alias.table))) {
          diagnostics.push(new vscode11.Diagnostic(
            this.findIdentifierRange(document, section, alias.schema ? `${alias.schema}.${alias.table}` : alias.table),
            `Table or view "${alias.schema ? `${alias.schema}.` : ""}${alias.table}" does not exist in ${schema}.`,
            vscode11.DiagnosticSeverity.Error
          ));
        }
      }
      diagnostics.push(...await this.getColumnDiagnostics(document, connection, section, cteNames, scriptRelations));
    }
    return diagnostics;
  }
  async getColumnDiagnostics(document, connection, section, cteNames, scriptRelations) {
    const diagnostics = [];
    const defaultSchema = connection.defaultSchema ?? "public";
    const aliases = new Map(section.aliases.map((alias) => [alias.alias.toLowerCase(), alias]));
    const seen = /* @__PURE__ */ new Set();
    const regex = /(?:"([^"]+)"|(\b[A-Za-z_][A-Za-z0-9_]*\b))\s*\.\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/g;
    let match;
    while ((match = regex.exec(section.sql)) !== null) {
      const qualifier = match[1] ?? match[2];
      const column = match[3] ?? match[4];
      const alias = aliases.get(qualifier.toLowerCase());
      if (!alias || cteNames.has(alias.table.toLowerCase()) || this.isScriptRelation(alias, scriptRelations)) {
        continue;
      }
      const key = `${alias.schema ?? defaultSchema}.${alias.table}.${column}`.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const columns = await this.schemaContext.getCachedColumns(connection, alias.schema ?? defaultSchema, alias.table);
      if (!columns) {
        if (this.connectionManager.isConnected(connection.id)) {
          this.schemaContext.refreshSchemaInBackground(connection, alias.schema ?? defaultSchema);
        }
        continue;
      }
      if (!columns.some((item) => item.name.toLowerCase() === column.toLowerCase())) {
        const start = section.start + match.index + match[0].lastIndexOf(column);
        diagnostics.push(new vscode11.Diagnostic(
          new vscode11.Range(document.positionAt(start), document.positionAt(start + column.length)),
          `Column "${column}" does not exist on ${alias.schema ? `${alias.schema}.` : ""}${alias.table}.`,
          vscode11.DiagnosticSeverity.Error
        ));
      }
    }
    diagnostics.push(...await this.getUnqualifiedColumnDiagnostics(document, connection, section, cteNames, scriptRelations));
    return diagnostics;
  }
  async getUnqualifiedColumnDiagnostics(document, connection, section, cteNames, scriptRelations) {
    const defaultSchema = connection.defaultSchema ?? "public";
    const relationKeys = /* @__PURE__ */ new Map();
    for (const alias of section.aliases) {
      if (cteNames.has(alias.table.toLowerCase()) || this.isScriptRelation(alias, scriptRelations)) {
        continue;
      }
      const schema = alias.schema ?? defaultSchema;
      relationKeys.set(this.relationKey(schema, alias.table), { schema, table: alias.table });
    }
    const [relation] = [...relationKeys.values()];
    if (!relation || relationKeys.size !== 1) {
      return [];
    }
    const columns = await this.schemaContext.getCachedColumns(connection, relation.schema, relation.table);
    if (!columns) {
      if (this.connectionManager.isConnected(connection.id)) {
        this.schemaContext.refreshSchemaInBackground(connection, relation.schema);
      }
      return [];
    }
    const columnNames = new Set(columns.map((column) => column.name.toLowerCase()));
    const ignored = this.unqualifiedColumnIgnoreSet(section, columns, defaultSchema);
    const diagnostics = [];
    const seen = /* @__PURE__ */ new Set();
    for (const [spanStart, spanEnd] of this.columnExpressionSpans(section.sql)) {
      const text = section.sql.slice(spanStart, spanEnd);
      const regex = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const token = match[0];
        const tokenStart = spanStart + match.index;
        const lower = token.toLowerCase();
        if (columnNames.has(lower) || ignored.has(lower) || this.isInsideSingleQuotedLiteral(section.sql, tokenStart) || this.isInLineComment(section.sql, tokenStart) || this.isQualifiedIdentifierPart(section.sql, tokenStart, token.length) || this.isTypeCastName(section.sql, tokenStart) || this.isFunctionName(section.sql, tokenStart + token.length) || this.isAliasDeclaration(section.sql, tokenStart)) {
          continue;
        }
        const key = `${lower}:${tokenStart}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        diagnostics.push(new vscode11.Diagnostic(
          new vscode11.Range(
            document.positionAt(section.start + tokenStart),
            document.positionAt(section.start + tokenStart + token.length)
          ),
          `Column "${token}" does not exist on ${relation.schema}.${relation.table}.`,
          vscode11.DiagnosticSeverity.Error
        ));
      }
    }
    return diagnostics;
  }
  async getPlannerDiagnostic(document, connection, section, scriptRelations) {
    if (section.aliases.some((alias) => this.isScriptRelation(alias, scriptRelations))) {
      return void 0;
    }
    let result;
    try {
      result = await this.connectionManager.getDriver(connection.type).validateQuery({
        connectionId: connection.id,
        sql: section.sql
      });
    } catch {
      return void 0;
    }
    if (result.ok || !result.error) {
      return void 0;
    }
    return new vscode11.Diagnostic(
      this.errorRange(document, section, result.error),
      this.errorMessage(result.error),
      vscode11.DiagnosticSeverity.Error
    );
  }
  findIdentifierRange(document, section, identifier) {
    const index = section.sql.toLowerCase().indexOf(identifier.toLowerCase());
    const start = section.start + Math.max(0, index);
    return new vscode11.Range(document.positionAt(start), document.positionAt(start + identifier.length));
  }
  collectCreatedRelationNames(document) {
    const relations = /* @__PURE__ */ new Set();
    const regex = /\bcreate\s+(?:temporary\s+|temp\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/gi;
    const text = document.getText();
    let match;
    while ((match = regex.exec(text)) !== null) {
      const [schema, table] = this.splitQualified(match[1]);
      relations.add(table.toLowerCase());
      if (schema) {
        relations.add(this.relationKey(schema, table));
      }
    }
    return relations;
  }
  isScriptRelation(alias, scriptRelations) {
    if (scriptRelations.has(alias.table.toLowerCase())) {
      return !alias.schema || alias.schema.toLowerCase() === "pg_temp";
    }
    return alias.schema ? scriptRelations.has(this.relationKey(alias.schema, alias.table)) : false;
  }
  splitQualified(value) {
    const parts = value.split(".").map((part) => part.replace(/^"|"$/g, ""));
    return parts.length > 1 ? [parts[0], parts[1]] : [void 0, parts[0]];
  }
  errorRange(document, section, error) {
    const messageRange = this.errorIdentifierRange(document, section, error);
    if (messageRange) {
      return messageRange;
    }
    const offset = Number(error.position);
    if (Number.isFinite(offset) && offset > 0) {
      const explainPrefixLength = "explain ".length;
      const relative = Math.max(0, offset - 1 - explainPrefixLength);
      const start = Math.min(section.end, section.start + relative);
      return this.expandIdentifierRange(document, section, start);
    }
    return section.range;
  }
  errorIdentifierRange(document, section, error) {
    const column = error.message.match(/\bcolumn\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+does not exist/i)?.[1];
    if (!column) {
      return void 0;
    }
    const regex = new RegExp(`\\b${escapeRegExp(column)}\\b`, "i");
    const match = regex.exec(section.sql);
    if (!match) {
      return void 0;
    }
    const start = section.start + match.index;
    return new vscode11.Range(document.positionAt(start), document.positionAt(start + column.length));
  }
  expandIdentifierRange(document, section, absoluteStart) {
    const sql = section.sql;
    const relative = Math.max(0, Math.min(sql.length, absoluteStart - section.start));
    let start = relative;
    let end = relative;
    while (start > 0 && /[A-Za-z0-9_]/.test(sql[start - 1])) {
      start -= 1;
    }
    while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end])) {
      end += 1;
    }
    if (start === end) {
      end = Math.min(sql.length, end + 1);
    }
    return new vscode11.Range(document.positionAt(section.start + start), document.positionAt(section.start + end));
  }
  errorMessage(error) {
    return [error.message, error.detail, error.hint].filter(Boolean).join("\n");
  }
  relationKey(schema, table) {
    return `${schema}.${table}`.toLowerCase();
  }
  collectCteNames(sections) {
    const names = /* @__PURE__ */ new Set();
    const visit = (section) => {
      if (section.kind === "cte" && section.name) {
        names.add(section.name.toLowerCase());
      }
      for (const child of section.children) {
        if (child.kind === "cte" && child.name) {
          names.add(child.name.toLowerCase());
        }
        visit({ ...child, aliases: [], tables: [] });
      }
    };
    for (const section of sections) {
      visit(section);
    }
    return names;
  }
  unqualifiedColumnIgnoreSet(section, columns, defaultSchema) {
    const ignored = new Set(SQL_COLUMN_CONTEXT_KEYWORDS);
    for (const alias of section.aliases) {
      ignored.add(alias.alias.toLowerCase());
      ignored.add(alias.table.toLowerCase());
      ignored.add((alias.schema ?? defaultSchema).toLowerCase());
    }
    for (const column of columns) {
      ignored.add(column.dataType.toLowerCase());
    }
    for (const alias of this.outputAliases(section.sql)) {
      ignored.add(alias.toLowerCase());
    }
    return ignored;
  }
  columnExpressionSpans(sql) {
    const spans = [];
    const select = /\bselect\b/i.exec(sql);
    const from = /\bfrom\b/i.exec(sql);
    if (select && from && from.index > select.index) {
      spans.push([select.index + select[0].length, from.index]);
    }
    for (const regex of [/\bwhere\b/gi, /\bhaving\b/gi, /\bgroup\s+by\b/gi, /\border\s+by\b/gi]) {
      for (const match of sql.matchAll(regex)) {
        if (match.index === void 0) {
          continue;
        }
        const start = match.index + match[0].length;
        spans.push([start, this.nextClauseIndex(sql, start)]);
      }
    }
    return spans;
  }
  nextClauseIndex(sql, start) {
    const match = /\b(?:where|group\s+by|order\s+by|having|limit|union|intersect|except)\b/i.exec(sql.slice(start));
    return match?.index === void 0 ? sql.length : start + match.index;
  }
  isQualifiedIdentifierPart(sql, start, length) {
    return sql.slice(0, start).trimEnd().endsWith(".") || sql.slice(start + length).trimStart().startsWith(".");
  }
  isTypeCastName(sql, start) {
    return sql.slice(0, start).trimEnd().endsWith("::");
  }
  isFunctionName(sql, end) {
    return sql.slice(end).trimStart().startsWith("(");
  }
  isAliasDeclaration(sql, start) {
    return /\bas\s+$/i.test(sql.slice(0, start));
  }
  outputAliases(sql) {
    const select = /\bselect\b/i.exec(sql);
    const from = /\bfrom\b/i.exec(sql);
    if (!select || !from || from.index <= select.index) {
      return [];
    }
    return [...sql.slice(select.index + select[0].length, from.index).matchAll(/\bas\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/gi)].map((match) => match[1] ?? match[2]).filter((alias) => Boolean(alias));
  }
  isInsideSingleQuotedLiteral(sql, start) {
    let inside = false;
    for (let index = 0; index < start; index += 1) {
      if (sql[index] !== "'") {
        continue;
      }
      if (sql[index + 1] === "'") {
        index += 1;
        continue;
      }
      inside = !inside;
    }
    return inside;
  }
  isInLineComment(sql, start) {
    const lineStart = sql.lastIndexOf("\n", start - 1) + 1;
    const commentStart = sql.indexOf("--", lineStart);
    return commentStart >= 0 && commentStart < start;
  }
};
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/services/sqlSectionHighlighter.ts
var vscode12 = __toESM(require("vscode"));
var SqlSectionHighlighter = class {
  singleLineDecoration = vscode12.window.createTextEditorDecorationType({
    border: "1px solid",
    borderColor: new vscode12.ThemeColor("testing.iconPassed"),
    borderRadius: "3px",
    overviewRulerColor: new vscode12.ThemeColor("testing.iconPassed"),
    overviewRulerLane: vscode12.OverviewRulerLane.Right
  });
  firstLineDecoration = vscode12.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderWidth: "1px 1px 0 1px",
    borderStyle: "solid",
    borderColor: new vscode12.ThemeColor("testing.iconPassed"),
    overviewRulerColor: new vscode12.ThemeColor("testing.iconPassed"),
    overviewRulerLane: vscode12.OverviewRulerLane.Right
  });
  middleLineDecoration = vscode12.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderWidth: "0 1px",
    borderStyle: "solid",
    borderColor: new vscode12.ThemeColor("testing.iconPassed")
  });
  lastLineDecoration = vscode12.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderWidth: "0 1px 1px 1px",
    borderStyle: "solid",
    borderColor: new vscode12.ThemeColor("testing.iconPassed"),
    borderRadius: "0 0 3px 3px"
  });
  activeRanges = /* @__PURE__ */ new Map();
  highlight(editor, range) {
    const targetRange = this.clampRange(editor.document, range);
    this.activeRanges.set(editor.document.uri.toString(), targetRange);
    this.applyDecorations(editor, targetRange);
  }
  async reveal(documentUri, range, expectedSql) {
    let document;
    try {
      document = await vscode12.workspace.openTextDocument(vscode12.Uri.parse(documentUri));
    } catch {
      void vscode12.window.showWarningMessage("Source SQL file no longer exists.");
      return void 0;
    }
    const editor = await vscode12.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false,
      viewColumn: vscode12.ViewColumn.Active
    });
    const targetRange = this.resolveRange(document, range, expectedSql);
    this.activeRanges.set(document.uri.toString(), targetRange);
    this.applyDecorations(editor, targetRange);
    editor.revealRange(targetRange, vscode12.TextEditorRevealType.InCenterIfOutsideViewport);
    return editor;
  }
  refreshVisibleEditors() {
    for (const editor of vscode12.window.visibleTextEditors) {
      const range = this.activeRanges.get(editor.document.uri.toString());
      this.applyDecorations(editor, range);
    }
  }
  clear(documentUri) {
    if (documentUri) {
      this.activeRanges.delete(documentUri);
    } else {
      this.activeRanges.clear();
    }
    this.refreshVisibleEditors();
  }
  dispose() {
    this.singleLineDecoration.dispose();
    this.firstLineDecoration.dispose();
    this.middleLineDecoration.dispose();
    this.lastLineDecoration.dispose();
  }
  applyDecorations(editor, range) {
    editor.setDecorations(this.singleLineDecoration, []);
    editor.setDecorations(this.firstLineDecoration, []);
    editor.setDecorations(this.middleLineDecoration, []);
    editor.setDecorations(this.lastLineDecoration, []);
    if (!range) {
      return;
    }
    if (range.start.line === range.end.line) {
      editor.setDecorations(this.singleLineDecoration, [range]);
      return;
    }
    const firstLine = editor.document.lineAt(range.start.line).range;
    const lastLine = editor.document.lineAt(range.end.line).range;
    const middleLines = [];
    for (let line = range.start.line + 1; line < range.end.line; line += 1) {
      middleLines.push(editor.document.lineAt(line).range);
    }
    editor.setDecorations(this.firstLineDecoration, [firstLine]);
    editor.setDecorations(this.middleLineDecoration, middleLines);
    editor.setDecorations(this.lastLineDecoration, [lastLine]);
  }
  resolveRange(document, range, expectedSql) {
    const direct = this.clampRange(document, range);
    const directText = document.getText(direct);
    if (!expectedSql || normalizeSql(directText) === normalizeSql(expectedSql)) {
      return direct;
    }
    const text = document.getText();
    const normalizedExpected = normalizeSql(expectedSql);
    const index = text.toLowerCase().indexOf(expectedSql.trim().toLowerCase());
    if (index >= 0) {
      return new vscode12.Range(document.positionAt(index), document.positionAt(index + expectedSql.trim().length));
    }
    for (const line of text.split(/\r?\n/).entries()) {
      if (normalizeSql(line[1]).includes(normalizedExpected.slice(0, 48))) {
        const start = new vscode12.Position(line[0], 0);
        return new vscode12.Range(start, start.translate(0, line[1].length));
      }
    }
    void vscode12.window.showWarningMessage("Source SQL range changed; showing the last known location.");
    return direct;
  }
  clampRange(document, range) {
    const maxLine = Math.max(0, document.lineCount - 1);
    const startLine = Math.min(Math.max(0, range.startLine), maxLine);
    const endLine = Math.min(Math.max(startLine, range.endLine), maxLine);
    const startColumn = Math.min(Math.max(0, range.startColumn), document.lineAt(startLine).text.length);
    const endColumn = Math.min(Math.max(0, range.endColumn), document.lineAt(endLine).text.length);
    return new vscode12.Range(
      new vscode12.Position(startLine, startColumn),
      new vscode12.Position(endLine, endColumn)
    );
  }
};
function rangeFromPlain(range) {
  return new vscode12.Range(
    new vscode12.Position(range.startLine, range.startColumn),
    new vscode12.Position(range.endLine, range.endColumn)
  );
}
function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

// src/services/sqlSectionService.ts
var vscode14 = __toESM(require("vscode"));

// src/services/sqlQueryTreeService.ts
var vscode13 = __toESM(require("vscode"));
var SqlQueryTreeService = class {
  getTree(document) {
    const text = document.getText();
    const counter = { value: 0 };
    return splitSqlStatements(text).map((statement) => {
      const sql = text.slice(statement.start, statement.end);
      const range = new vscode13.Range(document.positionAt(statement.start), document.positionAt(statement.end));
      const index = counter.value;
      counter.value += 1;
      const node = {
        id: this.nodeId(document.uri.toString(), "statement", statement.start, statement.end),
        index,
        kind: "statement",
        sql,
        range,
        start: statement.start,
        end: statement.end,
        children: [],
        aliasNames: this.extractAliases(sql)
      };
      node.children = this.parseChildren(document, sql, statement.start, counter);
      return node;
    });
  }
  findNode(document, selection) {
    const roots = this.getTree(document);
    if (!roots.length) {
      return void 0;
    }
    if (!selection.isEmpty) {
      const trimmed = this.trimRange(document, selection);
      if (trimmed.isEmpty) {
        return void 0;
      }
      return this.findSmallestContainingNode(roots, document.offsetAt(trimmed.start), document.offsetAt(trimmed.end));
    }
    const offset = document.offsetAt(selection.active);
    const token = this.wordAt(document.getText(), offset);
    const root = roots.find((node) => offset >= node.start && offset <= node.end);
    if (root && token) {
      const cte = this.findReferencedCte(root, token);
      if (cte) {
        return cte;
      }
    }
    return this.findSmallestContainingNode(roots, offset, offset);
  }
  findExecutableNode(document, selection) {
    const node = this.findNode(document, selection);
    if (!node) {
      return void 0;
    }
    if (node.kind !== "cte") {
      return node;
    }
    return this.getTree(document).find((root) => node.start >= root.start && node.end <= root.end);
  }
  getRootNodes(document) {
    return this.getTree(document);
  }
  getSyntaxIssues(document) {
    const text = document.getText();
    const issues = [];
    const stack = [];
    let single = false;
    let double = false;
    let lineComment = false;
    let blockCommentStart;
    let dollarTag;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (lineComment) {
        if (char === "\n") {
          lineComment = false;
        }
        continue;
      }
      if (blockCommentStart !== void 0) {
        if (char === "*" && next === "/") {
          blockCommentStart = void 0;
          i += 1;
        }
        continue;
      }
      if (dollarTag) {
        if (text.startsWith(dollarTag, i)) {
          i += dollarTag.length - 1;
          dollarTag = void 0;
        }
        continue;
      }
      if (single) {
        if (char === "'" && next === "'") {
          i += 1;
        } else if (char === "'") {
          single = false;
        }
        continue;
      }
      if (double) {
        if (char === '"' && next === '"') {
          i += 1;
        } else if (char === '"') {
          double = false;
        }
        continue;
      }
      if (char === "-" && next === "-") {
        lineComment = true;
        i += 1;
        continue;
      }
      if (char === "/" && next === "*") {
        blockCommentStart = i;
        i += 1;
        continue;
      }
      if (char === "'") {
        single = true;
        continue;
      }
      if (char === '"') {
        double = true;
        continue;
      }
      if (char === "$") {
        const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          i += dollarTag.length - 1;
          continue;
        }
      }
      if (char === "(") {
        stack.push(i);
      } else if (char === ")") {
        const open = stack.pop();
        if (open === void 0) {
          issues.push({
            message: "Unexpected closing parenthesis.",
            range: new vscode13.Range(document.positionAt(i), document.positionAt(i + 1))
          });
        }
      }
    }
    for (const open of stack) {
      issues.push({
        message: "Missing closing parenthesis.",
        range: new vscode13.Range(document.positionAt(open), document.positionAt(open + 1))
      });
    }
    if (single) {
      issues.push(this.endOfDocumentIssue(document, "Unterminated string literal."));
    }
    if (double) {
      issues.push(this.endOfDocumentIssue(document, "Unterminated quoted identifier."));
    }
    if (blockCommentStart !== void 0) {
      issues.push({
        message: "Unterminated block comment.",
        range: new vscode13.Range(document.positionAt(blockCommentStart), document.positionAt(blockCommentStart + 2))
      });
    }
    if (dollarTag) {
      issues.push(this.endOfDocumentIssue(document, `Unterminated dollar quote ${dollarTag}.`));
    }
    issues.push(...this.getDanglingClauseIssues(document));
    return issues;
  }
  parseChildren(document, text, baseOffset, counter) {
    const children = [];
    let i = 0;
    let single = false;
    let double = false;
    let lineComment = false;
    let blockComment = false;
    let dollarTag;
    while (i < text.length) {
      const char = text[i];
      const next = text[i + 1];
      if (lineComment) {
        if (char === "\n") {
          lineComment = false;
        }
        i += 1;
        continue;
      }
      if (blockComment) {
        if (char === "*" && next === "/") {
          blockComment = false;
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }
      if (dollarTag) {
        if (text.startsWith(dollarTag, i)) {
          i += dollarTag.length;
          dollarTag = void 0;
        } else {
          i += 1;
        }
        continue;
      }
      if (single) {
        if (char === "'" && next === "'") {
          i += 2;
        } else if (char === "'") {
          single = false;
          i += 1;
        } else {
          i += 1;
        }
        continue;
      }
      if (double) {
        if (char === '"' && next === '"') {
          i += 2;
        } else if (char === '"') {
          double = false;
          i += 1;
        } else {
          i += 1;
        }
        continue;
      }
      if (char === "-" && next === "-") {
        lineComment = true;
        i += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        blockComment = true;
        i += 2;
        continue;
      }
      if (char === "'") {
        single = true;
        i += 1;
        continue;
      }
      if (char === '"') {
        double = true;
        i += 1;
        continue;
      }
      if (char === "$") {
        const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          i += dollarTag.length;
          continue;
        }
      }
      const withMatch = this.matchWord(text, i, "with");
      if (withMatch) {
        const parsed = this.parseWithClause(document, text, baseOffset, i, counter);
        if (parsed) {
          children.push(...parsed.nodes);
          i = parsed.nextIndex;
          continue;
        }
      }
      if (char === "(") {
        const close = this.findMatchingParen(text, i);
        if (close > i) {
          const inner = text.slice(i + 1, close);
          const trimmed = this.trimBounds(inner, 0, inner.length);
          if (trimmed) {
            const innerSql = inner.slice(trimmed.start, trimmed.end);
            if (this.isQueryStart(innerSql)) {
              const start = baseOffset + i + 1 + trimmed.start;
              const end = baseOffset + i + 1 + trimmed.end;
              const child = {
                id: this.nodeId(document.uri.toString(), "subquery", start, end),
                index: counter.value += 1,
                kind: "subquery",
                sql: innerSql,
                range: new vscode13.Range(document.positionAt(start), document.positionAt(end)),
                start,
                end,
                children: [],
                aliasNames: this.extractAliases(innerSql)
              };
              child.children = this.parseChildren(document, innerSql, start, counter);
              children.push(child);
            }
          }
          const nestedBaseOffset = baseOffset + i + 1;
          const nestedChildren = this.parseChildren(document, inner, nestedBaseOffset, counter).filter((child) => !children.some((existing) => existing.start === child.start && existing.end === child.end));
          children.push(...nestedChildren);
          i = close + 1;
          continue;
        }
      }
      i += 1;
    }
    return children;
  }
  parseWithClause(document, text, baseOffset, withIndex, counter) {
    let i = withIndex + 4;
    i = this.skipWhitespace(text, i);
    if (this.matchWord(text, i, "recursive")) {
      i += "recursive".length;
      i = this.skipWhitespace(text, i);
    }
    const nodes = [];
    while (i < text.length) {
      i = this.skipWhitespace(text, i);
      const nameMatch = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*|"[^"]+"/);
      if (!nameMatch) {
        break;
      }
      const name = this.stripQuotes(nameMatch[0]);
      const nameStart = i;
      i += nameMatch[0].length;
      i = this.skipWhitespace(text, i);
      if (text[i] === "(") {
        const columnsClose = this.findMatchingParen(text, i);
        if (columnsClose > i) {
          i = columnsClose + 1;
          i = this.skipWhitespace(text, i);
        }
      }
      if (!this.matchWord(text, i, "as")) {
        break;
      }
      i += 2;
      i = this.skipWhitespace(text, i);
      if (text[i] !== "(") {
        break;
      }
      const open = i;
      const close = this.findMatchingParen(text, open);
      if (close <= open) {
        break;
      }
      const nodeStart = nameStart;
      const nodeEnd = close + 1;
      const sql = text.slice(nodeStart, nodeEnd);
      const start = baseOffset + nodeStart;
      const end = baseOffset + nodeEnd;
      const node = {
        id: this.nodeId(document.uri.toString(), "cte", start, end, name),
        index: counter.value += 1,
        kind: "cte",
        name,
        sql,
        range: new vscode13.Range(document.positionAt(start), document.positionAt(end)),
        start,
        end,
        children: [],
        aliasNames: this.extractAliases(sql)
      };
      const body = text.slice(open + 1, close);
      node.children = this.parseChildren(document, body, baseOffset + open + 1, counter);
      nodes.push(node);
      i = close + 1;
      i = this.skipWhitespace(text, i);
      if (text[i] === ",") {
        i += 1;
        continue;
      }
      break;
    }
    return nodes.length ? { nodes, nextIndex: i } : void 0;
  }
  findSmallestContainingNode(nodes, startOffset, endOffset) {
    const flat = this.flatten(nodes).filter((node) => startOffset >= node.start && endOffset <= node.end);
    if (!flat.length) {
      return nodes.find((node) => startOffset >= node.start && endOffset <= node.end);
    }
    flat.sort((a, b) => a.end - a.start - (b.end - b.start));
    return flat[0];
  }
  flatten(nodes) {
    const flat = [];
    for (const node of nodes) {
      flat.push(node);
      flat.push(...this.flatten(node.children));
    }
    return flat;
  }
  findReferencedCte(root, token) {
    const tokenLower = token.toLowerCase();
    return this.flatten(root.children).find((node) => node.kind === "cte" && node.name?.toLowerCase() === tokenLower);
  }
  extractAliases(sql) {
    const aliases = [];
    const regex = /\b(?:from|join|update|into)\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)\s*(?:as\s+)?(?!(?:where|join|left|right|inner|outer|full|cross|on|using|group|order|limit|set)\b)(?:"([^"]+)"|(\w+))?/gi;
    let match;
    while ((match = regex.exec(sql)) !== null) {
      const alias = match[2] ?? match[3];
      if (alias) {
        aliases.push(this.stripQuotes(alias));
      }
    }
    return aliases;
  }
  matchWord(text, index, word) {
    const slice = text.slice(index, index + word.length);
    if (slice.toLowerCase() !== word.toLowerCase()) {
      return false;
    }
    const before = index > 0 ? text[index - 1] : "";
    const after = text[index + word.length] ?? "";
    return !this.isWordChar(before) && !this.isWordChar(after);
  }
  isQueryStart(sql) {
    return /^(with|select|values|insert|update|delete)\b/i.test(sql.trim());
  }
  wordAt(text, offset) {
    let start = offset;
    let end = offset;
    while (start > 0 && this.isWordChar(text[start - 1])) {
      start -= 1;
    }
    while (end < text.length && this.isWordChar(text[end])) {
      end += 1;
    }
    const word = text.slice(start, end).trim();
    return word || void 0;
  }
  findMatchingParen(text, openIndex) {
    let depth = 0;
    let single = false;
    let double = false;
    let lineComment = false;
    let blockComment = false;
    let dollarTag;
    for (let i = openIndex; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (lineComment) {
        if (char === "\n") {
          lineComment = false;
        }
        continue;
      }
      if (blockComment) {
        if (char === "*" && next === "/") {
          blockComment = false;
          i += 1;
        }
        continue;
      }
      if (dollarTag) {
        if (text.startsWith(dollarTag, i)) {
          i += dollarTag.length - 1;
          dollarTag = void 0;
        }
        continue;
      }
      if (single) {
        if (char === "'" && next === "'") {
          i += 1;
        } else if (char === "'") {
          single = false;
        }
        continue;
      }
      if (double) {
        if (char === '"' && next === '"') {
          i += 1;
        } else if (char === '"') {
          double = false;
        }
        continue;
      }
      if (char === "-" && next === "-") {
        lineComment = true;
        i += 1;
        continue;
      }
      if (char === "/" && next === "*") {
        blockComment = true;
        i += 1;
        continue;
      }
      if (char === "'") {
        single = true;
        continue;
      }
      if (char === '"') {
        double = true;
        continue;
      }
      if (char === "$") {
        const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          i += dollarTag.length - 1;
          continue;
        }
      }
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  }
  trimBounds(text, start, end) {
    let nextStart = start;
    let nextEnd = end;
    while (nextStart < nextEnd && /\s/.test(text[nextStart])) {
      nextStart += 1;
    }
    while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1])) {
      nextEnd -= 1;
    }
    return nextStart < nextEnd ? { start: nextStart, end: nextEnd } : void 0;
  }
  trimRange(document, range) {
    const text = document.getText(range);
    const trimmed = this.trimBounds(text, 0, text.length);
    if (!trimmed) {
      return new vscode13.Range(range.start, range.start);
    }
    const base = document.offsetAt(range.start);
    return new vscode13.Range(document.positionAt(base + trimmed.start), document.positionAt(base + trimmed.end));
  }
  skipWhitespace(text, index) {
    let i = index;
    while (i < text.length && /\s/.test(text[i])) {
      i += 1;
    }
    return i;
  }
  isWordChar(char) {
    return !!char && /[A-Za-z0-9_]/.test(char);
  }
  stripQuotes(value) {
    return value.replace(/^"|"$/g, "");
  }
  getDanglingClauseIssues(document) {
    const text = document.getText();
    const issues = [];
    for (const statement of splitSqlStatements(text)) {
      const tokens = this.wordTokens(text, statement.start, statement.end);
      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        const word = token.word.toLowerCase();
        if (!["from", "join", "update", "into"].includes(word)) {
          continue;
        }
        const next = tokens[index + 1]?.word.toLowerCase();
        if (!next || this.isClauseBoundary(next)) {
          issues.push({
            message: `Expected a table name after ${word.toUpperCase()}.`,
            range: new vscode13.Range(document.positionAt(token.start), document.positionAt(token.end))
          });
        }
      }
    }
    return issues;
  }
  wordTokens(text, start, end) {
    const tokens = [];
    let i = start;
    let single = false;
    let double = false;
    let lineComment = false;
    let blockComment = false;
    let dollarTag;
    while (i < end) {
      const char = text[i];
      const next = text[i + 1];
      if (lineComment) {
        lineComment = char !== "\n";
        i += 1;
        continue;
      }
      if (blockComment) {
        if (char === "*" && next === "/") {
          blockComment = false;
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }
      if (dollarTag) {
        if (text.startsWith(dollarTag, i)) {
          i += dollarTag.length;
          dollarTag = void 0;
        } else {
          i += 1;
        }
        continue;
      }
      if (single) {
        if (char === "'" && next === "'") {
          i += 2;
        } else {
          single = char !== "'";
          i += 1;
        }
        continue;
      }
      if (double) {
        if (char === '"' && next === '"') {
          i += 2;
        } else {
          double = char !== '"';
          i += 1;
        }
        continue;
      }
      if (char === "-" && next === "-") {
        lineComment = true;
        i += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        blockComment = true;
        i += 2;
        continue;
      }
      if (char === "'") {
        single = true;
        i += 1;
        continue;
      }
      if (char === '"') {
        double = true;
        i += 1;
        continue;
      }
      if (char === "$") {
        const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          i += dollarTag.length;
          continue;
        }
      }
      if (this.isWordChar(char)) {
        const tokenStart = i;
        while (i < end && this.isWordChar(text[i])) {
          i += 1;
        }
        tokens.push({ word: text.slice(tokenStart, i), start: tokenStart, end: i });
        continue;
      }
      i += 1;
    }
    return tokens;
  }
  isClauseBoundary(word) {
    return [
      "where",
      "group",
      "order",
      "limit",
      "having",
      "union",
      "intersect",
      "except",
      "join",
      "left",
      "right",
      "inner",
      "outer",
      "full",
      "cross",
      "on",
      "using",
      "set",
      "values",
      "returning"
    ].includes(word);
  }
  endOfDocumentIssue(document, message) {
    const end = document.positionAt(document.getText().length);
    return {
      message,
      range: new vscode13.Range(end, end)
    };
  }
  nodeId(documentUri, kind, start, end, name) {
    return `${documentUri}:${kind}:${start}-${end}${name ? `:${name}` : ""}`;
  }
};

// src/services/sqlSectionService.ts
var SqlSectionService = class {
  treeService = new SqlQueryTreeService();
  getSections(document) {
    return this.treeService.getRootNodes(document).map((node) => this.toSection(node));
  }
  getTree(document) {
    return this.treeService.getTree(document).map((node) => this.toSection(node));
  }
  detect(document, selection) {
    const node = this.treeService.findNode(document, selection);
    return node ? this.toSection(node) : void 0;
  }
  detectExecutable(document, selection) {
    const node = this.treeService.findExecutableNode(document, selection);
    return node ? this.toSection(node) : void 0;
  }
  getSyntaxIssues(document) {
    return this.treeService.getSyntaxIssues(document).map((issue) => new vscode14.Diagnostic(
      issue.range,
      issue.message,
      vscode14.DiagnosticSeverity.Error
    ));
  }
  outline(document) {
    return this.getSections(document).map((section) => new vscode14.SymbolInformation(
      section.kind === "cte" && section.name ? `CTE ${section.name}` : `SQL section ${section.index + 1}`,
      vscode14.SymbolKind.Function,
      section.sql.replace(/\s+/g, " ").slice(0, 80),
      new vscode14.Location(document.uri, section.range)
    ));
  }
  extractAliases(sql) {
    const aliases = [];
    const regex = /\b(?:from|join|update|into)\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)\s*(?:as\s+)?(?!(?:where|join|left|right|inner|outer|full|cross|on|using|group|order|limit|set)\b)(?:"([^"]+)"|(\w+))?/gi;
    let match;
    while ((match = regex.exec(sql)) !== null) {
      const [schema, table] = splitQualified(match[1]);
      const alias = stripQuotes2(match[2] ?? match[3] ?? table);
      aliases.push({ alias, schema, table });
    }
    return aliases;
  }
  extractTables(sql) {
    return this.extractAliases(sql).map(({ schema, table }) => ({ schema, table }));
  }
  toSection(node) {
    return {
      ...node,
      aliases: this.extractAliases(node.sql),
      tables: this.extractTables(node.sql)
    };
  }
};
function splitQualified(value) {
  const parts = value.split(".").map(stripQuotes2);
  return parts.length > 1 ? [parts[0], parts[1]] : [void 0, parts[0]];
}
function stripQuotes2(value) {
  return value.replace(/^"|"$/g, "");
}

// src/services/sqlSelectionExecution.ts
function shouldRunSelectionForStatement(selected, statementRange) {
  return selected.some((selection) => rangesOverlap(selection.range, statementRange) && splitSqlStatements(selection.sql).length > 1);
}
function rangesOverlap(a, b) {
  return comparePositions(a.start, b.end) <= 0 && comparePositions(a.end, b.start) >= 0;
}
function comparePositions(a, b) {
  return a.line - b.line || a.character - b.character;
}

// src/ai/vsCodeLanguageModelSqlAdapter.ts
var vscode15 = __toESM(require("vscode"));

// src/ai/queryMemorySummaryParser.ts
function parseQueryMemorySummaryText(text) {
  const json = extractJson(text);
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The language model did not return valid summary JSON.");
  }
  const maybe = parsed;
  if (typeof maybe.title !== "string" || typeof maybe.summary !== "string") {
    throw new Error("The language model summary is missing title or summary.");
  }
  return {
    title: maybe.title.trim().slice(0, 80),
    summary: maybe.summary.trim().slice(0, 300),
    tables: Array.isArray(maybe.tables) ? maybe.tables.filter((value) => typeof value === "string").slice(0, 20) : [],
    columns: Array.isArray(maybe.columns) ? maybe.columns.filter((value) => typeof value === "string").slice(0, 40) : []
  };
}
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("The language model did not return summary JSON.");
  }
  return candidate.slice(start, end + 1);
}

// src/ai/vsCodeLanguageModelSqlAdapter.ts
var VsCodeLanguageModelSqlAdapter = class {
  async isAvailable() {
    const lm2 = this.languageModelNamespace();
    if (!lm2?.selectChatModels) {
      return false;
    }
    try {
      const models = await lm2.selectChatModels({ vendor: "copilot" });
      return models.length > 0;
    } catch {
      return false;
    }
  }
  async send(request) {
    const lm2 = this.languageModelNamespace();
    if (!lm2?.selectChatModels) {
      throw new Error("VS Code Language Model API is not available.");
    }
    const models = await lm2.selectChatModels({ vendor: "copilot" });
    const model = models[0];
    if (!model) {
      throw new Error("No VS Code language model is available.");
    }
    const prompt = this.prompt(request);
    const messages = [
      vscode15.LanguageModelChatMessage?.User(prompt) ?? { role: "user", content: prompt }
    ];
    const response = await model.sendRequest(messages, {}, new vscode15.CancellationTokenSource().token);
    let text = "";
    for await (const chunk of response.text) {
      text += chunk;
    }
    const sql = this.extractSql(text);
    if (!sql.trim()) {
      throw new Error("The language model did not return SQL.");
    }
    return sql;
  }
  async summarizeQueryMemory(request) {
    const text = await this.sendRaw(this.summaryPrompt(request));
    return this.parseSummary(text);
  }
  prompt(request) {
    const schema = request.relevantSchema.tables.map((table) => {
      const columns = table.columns?.map((column) => `${column.name} ${column.dataType}${column.nullable ? "" : " not null"}`).join(", ");
      return `${table.schema}.${table.name}${columns ? ` (${columns})` : ""}`;
    }).join("\n");
    return [
      "You are helping write PostgreSQL/Redshift SQL inside VS Code.",
      "Return only SQL or concise SQL comments plus SQL. Do not execute anything.",
      `Action: ${request.action}`,
      request.selectedSql ? `Selected SQL:
${request.selectedSql}` : "",
      request.lastError ? `Last error:
${request.lastError}` : "",
      `Visible database context: ${request.relevantSchema.connectionName ?? "connection"} ${request.relevantSchema.databaseName ?? ""}`,
      `Schema:
${schema || "(no schema metadata available)"}`
    ].filter(Boolean).join("\n\n");
  }
  async sendRaw(prompt) {
    const lm2 = this.languageModelNamespace();
    if (!lm2?.selectChatModels) {
      throw new Error("VS Code Language Model API is not available.");
    }
    const models = await lm2.selectChatModels({ vendor: "copilot" });
    const model = models[0];
    if (!model) {
      throw new Error("No VS Code language model is available.");
    }
    const messages = [
      vscode15.LanguageModelChatMessage?.User(prompt) ?? { role: "user", content: prompt }
    ];
    const response = await model.sendRequest(messages, {}, new vscode15.CancellationTokenSource().token);
    let text = "";
    for await (const chunk of response.text) {
      text += chunk;
    }
    return text;
  }
  summaryPrompt(request) {
    return [
      "Summarize this SQL query for local query-memory search inside VS Code.",
      'Return only JSON with this shape: {"title":"short title","summary":"one sentence","tables":["schema.table"],"columns":["table.column"]}.',
      "Do not include result row values. Do not include secrets.",
      `Connection: ${request.connectionName ?? "connection"} ${request.databaseName ?? ""} ${request.databaseType ?? ""}`,
      request.outputColumns?.length ? `Output columns: ${request.outputColumns.join(", ")}` : "",
      request.errorMessage ? `Execution error: ${request.errorMessage}` : "",
      `SQL:
${request.sql}`
    ].filter(Boolean).join("\n\n");
  }
  parseSummary(text) {
    return parseQueryMemorySummaryText(text);
  }
  languageModelNamespace() {
    return vscode15.lm;
  }
  extractSql(text) {
    const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
    return (fenced?.[1] ?? text).trim();
  }
  extractJson(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] ?? text).trim();
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      throw new Error("The language model did not return summary JSON.");
    }
    return candidate.slice(start, end + 1);
  }
};

// src/controllers/queryMemoryController.ts
var vscode16 = __toESM(require("vscode"));
var QueryMemoryController = class {
  constructor(context, memory, connectionManager, executor, ai, addResultTab) {
    this.context = context;
    this.memory = memory;
    this.connectionManager = connectionManager;
    this.executor = executor;
    this.ai = ai;
    this.addResultTab = addResultTab;
  }
  safety = new SqlSafetyClassifier();
  register(register) {
    register("database.findPastQuery", () => this.findPastQuery());
    register("database.backfillQueryMemorySummaries", () => this.backfillSummaries());
  }
  async findPastQuery() {
    const query = await vscode16.window.showInputBox({
      prompt: "Find past query",
      placeHolder: "duplicate invoices, monthly churn, customer email last_login"
    });
    if (query === void 0) {
      return;
    }
    const connection = this.connectionManager.getPreferredConnection();
    const results = await this.memory.search({
      query,
      connectionId: connection?.id,
      limit: 20,
      includeFailed: true
    });
    if (!results.length) {
      void vscode16.window.showInformationMessage("No matching query memory found.");
      return;
    }
    const picked = await vscode16.window.showQuickPick(results.map((result) => this.toPick(result)), {
      placeHolder: "Query memory results",
      matchOnDescription: true,
      matchOnDetail: true
    });
    if (!picked) {
      return;
    }
    await this.handleAction(picked.result);
  }
  async handleAction(result) {
    const item = result.item;
    const safety = this.safety.classify(item.sql, { production: this.connectionManager.getConnection(item.connectionId ?? "")?.production });
    const aiAvailable = await this.ai.isAvailable();
    const actions = [
      { label: "Open SQL", action: "open" },
      { label: "Copy SQL", action: "copy" },
      aiAvailable ? { label: "Explain", action: "explain" } : void 0,
      aiAvailable ? { label: "Modify...", action: "modify" } : void 0,
      safety.previewAvailable ? { label: "Preview Safety SQL", action: "preview" } : void 0,
      { label: safety.requiresConfirmation ? "Run with Safety Check" : "Run", action: "run" }
    ].filter((action) => action !== void 0);
    const picked = await vscode16.window.showQuickPick(actions, {
      placeHolder: [item.title ?? "Query memory", safety.reasons.join(" ")].filter(Boolean).join(" - ")
    });
    if (!picked) {
      return;
    }
    if (picked.action === "open") {
      await this.openSql(item.sql, item.title ?? "Query Memory");
    } else if (picked.action === "copy") {
      await vscode16.env.clipboard.writeText(item.sql);
    } else if (picked.action === "explain") {
      await this.openAiResult("Explain Query", await this.ai.send({ action: "explain", selectedSql: item.sql, relevantSchema: { tables: [] } }));
    } else if (picked.action === "modify") {
      const instruction = await vscode16.window.showInputBox({ prompt: "How should this query change?" });
      if (instruction) {
        await this.openAiResult("Modified Query", await this.ai.send({ action: "generate", selectedSql: item.sql, lastError: instruction, relevantSchema: { tables: [] } }));
      }
    } else if (picked.action === "preview") {
      const preview = this.safety.previewSql(item.sql);
      if (preview) {
        await this.openSql(preview, "Query Safety Preview");
      }
    } else if (picked.action === "run") {
      await this.run(item.sql, item.connectionId);
    }
  }
  async run(sql, connectionId) {
    const connection = connectionId ? this.connectionManager.getConnection(connectionId) : this.connectionManager.getPreferredConnection();
    if (!connection) {
      void vscode16.window.showInformationMessage("Select a database connection before running query memory SQL.");
      return;
    }
    const tab = await this.executor.execute({ connectionId: connection.id, sql });
    await this.addResultTab(tab);
  }
  async backfillSummaries() {
    if (!await this.ai.isAvailable()) {
      void vscode16.window.showInformationMessage("Query memory summaries require an available VS Code language model.");
      return;
    }
    await vscode16.window.withProgress({
      location: vscode16.ProgressLocation.Notification,
      title: "Summarizing query memory",
      cancellable: true
    }, async (_progress, token) => {
      const result = await this.memory.backfillSummaries({ limit: 25, token });
      void vscode16.window.showInformationMessage(`Query memory backfill: ${result.succeeded} summarized, ${result.failed} failed, ${result.skipped} skipped.`);
    });
  }
  toPick(result) {
    const item = result.item;
    const title = item.title ?? item.sql.replace(/\s+/g, " ").slice(0, 80);
    const meta = [
      item.connectionName ?? item.databaseName,
      item.status,
      item.runCount && item.runCount > 1 ? `${item.runCount} runs` : void 0,
      item.rowCount !== void 0 ? `${item.rowCount} rows` : void 0,
      item.executedAt ? new Date(item.executedAt).toLocaleString() : void 0
    ].filter(Boolean).join(" - ");
    return {
      label: title,
      description: `${Math.round(result.score)} pts${result.safety.risk !== "safe" ? ` - ${result.safety.risk}` : ""}`,
      detail: [item.summary, meta, result.reasons.join(", "), item.sql.replace(/\s+/g, " ").slice(0, 180)].filter(Boolean).join("\n"),
      result
    };
  }
  async openSql(sql, title) {
    const doc = await vscode16.workspace.openTextDocument({ language: "sql", content: `${sql.trim()}
` });
    await vscode16.window.showTextDocument(doc, { preview: false, viewColumn: vscode16.ViewColumn.Beside });
  }
  async openAiResult(title, text) {
    const doc = await vscode16.workspace.openTextDocument({ language: "sql", content: `-- ${title}
${text.trim()}
` });
    await vscode16.window.showTextDocument(doc, { preview: true, viewColumn: vscode16.ViewColumn.Beside });
  }
};

// src/services/documentConnectionResolver.ts
function resolveDocumentConnection(documentUri, bindings, connections, fallback) {
  const binding = bindings.find((record) => record.documentUri === documentUri);
  if (binding) {
    return {
      connection: connections.find((connection) => connection.id === binding.connectionId),
      isBound: true,
      boundConnectionId: binding.connectionId
    };
  }
  return {
    connection: fallback,
    isBound: false
  };
}

// src/services/queryOutputService.ts
var vscode17 = __toESM(require("vscode"));
var MAX_OUTPUT_LINES_PER_CONNECTION = 600;
var QueryOutputService = class {
  channels = /* @__PURE__ */ new Map();
  lineCounts = /* @__PURE__ */ new Map();
  record(connection, tab) {
    this.channelFor(connection);
    this.ensureCapacity(connection.id, 3 + (tab.error ? 2 : 0));
    this.append(connection.id, `[${new Date(tab.executionStartedAt).toLocaleTimeString()}] ${tab.executionStatus.toUpperCase()} ${tab.executionTimeMs ?? 0}ms ${tab.rowCount ?? 0} rows - ${tab.title}`);
    if (tab.error) {
      this.append(connection.id, `ERROR ${tab.error.code ? `${tab.error.code}: ` : ""}${tab.error.message}`);
    }
    this.append(connection.id, "");
  }
  recordExecutionStarted(connection, fileName, statementCount) {
    this.channelFor(connection);
    this.ensureCapacity(connection.id, 4);
    this.append(connection.id, `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] RUNNING ${statementCount} statement${statementCount === 1 ? "" : "s"}${fileName ? ` - ${fileName}` : ""}`);
  }
  recordProgress(connection, progress) {
    this.channelFor(connection);
    if (progress.status === "started") {
      this.ensureCapacity(connection.id, this.lineCount(progress.sql) + 4);
      this.append(connection.id, `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] statement ${progress.statementIndex + 1}/${progress.statementCount} running`);
      this.appendMultiline(connection.id, progress.sql);
      return;
    }
    this.ensureCapacity(connection.id, 3 + (progress.errorMessage ? 1 : 0));
    const duration = progress.durationMs !== void 0 ? `${progress.durationMs}ms` : "unknown duration";
    if (progress.status === "completed") {
      const rows = progress.rowCount !== void 0 ? ` - ${progress.rowCount} rows` : "";
      const command = progress.command ? ` - ${progress.command}` : "";
      this.append(connection.id, `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] statement ${progress.statementIndex + 1}/${progress.statementCount} completed in ${duration}${rows}${command}`);
    } else {
      this.append(connection.id, `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] statement ${progress.statementIndex + 1}/${progress.statementCount} failed in ${duration}`);
      if (progress.errorMessage) {
        this.append(connection.id, `ERROR ${progress.errorMessage}`);
      }
    }
  }
  show(connection, preserveFocus = true) {
    this.channelFor(connection).show(preserveFocus);
  }
  disposeConnection(connectionId) {
    this.channels.get(connectionId)?.dispose();
    this.channels.delete(connectionId);
    this.lineCounts.delete(connectionId);
  }
  dispose() {
    for (const channel of this.channels.values()) {
      channel.dispose();
    }
    this.channels.clear();
    this.lineCounts.clear();
  }
  channelFor(connection) {
    const existing = this.channels.get(connection.id);
    if (existing) {
      return existing;
    }
    const channel = vscode17.window.createOutputChannel(`Database: ${connection.name}`);
    this.channels.set(connection.id, channel);
    this.lineCounts.set(connection.id, 0);
    return channel;
  }
  append(connectionId, line) {
    const channel = this.channels.get(connectionId);
    if (!channel) {
      return;
    }
    channel.appendLine(line);
    this.lineCounts.set(connectionId, (this.lineCounts.get(connectionId) ?? 0) + 1);
  }
  appendMultiline(connectionId, text) {
    for (const line of text.split(/\r?\n/)) {
      this.append(connectionId, `  ${line}`);
    }
  }
  ensureCapacity(connectionId, incomingLines) {
    const channel = this.channels.get(connectionId);
    if (!channel) {
      return;
    }
    const nextLineCount = (this.lineCounts.get(connectionId) ?? 0) + incomingLines;
    if (nextLineCount <= MAX_OUTPUT_LINES_PER_CONNECTION) {
      return;
    }
    channel.clear();
    this.lineCounts.set(connectionId, 0);
    this.append(connectionId, `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Output truncated to keep memory bounded.`);
    this.append(connectionId, "");
  }
  lineCount(text) {
    return text.split(/\r?\n/).length;
  }
};

// src/webviews/connection/ConnectionEditorPanel.ts
var vscode18 = __toESM(require("vscode"));
var ConnectionEditorPanel = class _ConnectionEditorPanel {
  constructor(panel, connectionManager, existing, resolve) {
    this.panel = panel;
    this.connectionManager = connectionManager;
    this.existing = existing;
    this.resolve = resolve;
    this.panel.onDidDispose(() => this.resolve(void 0));
    this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message));
  }
  static async open(context, connectionManager, existing) {
    return new Promise((resolve) => {
      const panel = vscode18.window.createWebviewPanel(
        "databaseConnectionEditor",
        existing ? `Edit ${existing.name}` : "Add Database Connection",
        vscode18.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      const editor = new _ConnectionEditorPanel(panel, connectionManager, existing, resolve);
      context.subscriptions.push(panel);
      editor.render();
    });
  }
  render() {
    this.panel.webview.html = this.html(this.panel.webview, this.toForm(this.existing));
  }
  async handleMessage(message) {
    if (message.type === "cancel") {
      this.panel.dispose();
      return;
    }
    if (message.type === "delete") {
      await this.connectionManager.delete(message.id);
      const connections = this.connectionManager.getConnections();
      await this.connectionManager.setSelectedConnection(connections[0]?.id);
      await this.panel.webview.postMessage({
        type: "connections",
        connections,
        selectedId: connections[0]?.id ?? "new"
      });
      return;
    }
    if (message.type === "test") {
      await this.postState("testing", "Testing connection...");
      try {
        let config = this.fromForm(message.config);
        if (!config.password && config.id) {
          const existingWithPassword = await this.connectionManager.getConnectionWithPassword(config.id);
          config = { ...config, password: existingWithPassword.password };
        }
        const detail = await this.connectionManager.testConfig(config);
        await this.postState("success", `Connected: ${detail}`);
      } catch (error) {
        await this.postState("error", error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (message.type === "save") {
      try {
        let config = this.fromForm(message.config);
        if (!config.password && config.id) {
          const existingWithPassword = await this.connectionManager.getConnectionWithPassword(config.id);
          config = { ...config, password: existingWithPassword.password };
        }
        this.resolve(config);
        this.panel.dispose();
      } catch (error) {
        await this.postState("error", error instanceof Error ? error.message : String(error));
      }
    }
  }
  async postState(state, message) {
    await this.panel.webview.postMessage({ type: "state", state, message });
  }
  fromForm(form) {
    const port = Number(form.port);
    if (!form.name.trim() || !form.host.trim() || !form.database.trim() || !form.username.trim()) {
      throw new Error("Name, host, database, and username are required.");
    }
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error("Port must be a positive number.");
    }
    return {
      id: form.id ?? this.existing?.id ?? createId("conn"),
      name: form.name.trim(),
      type: form.type,
      host: form.host.trim(),
      port,
      database: form.database.trim(),
      username: form.username.trim(),
      password: form.password === "" ? void 0 : form.password,
      sslMode: form.sslMode,
      defaultSchema: form.defaultSchema?.trim() || "public",
      color: form.color,
      connectTimeoutMs: toOptionalNumber(form.connectTimeoutMs),
      queryTimeoutMs: toOptionalNumber(form.queryTimeoutMs),
      production: form.production === true,
      readOnlyDefault: form.readOnlyDefault === true
    };
  }
  toForm(connection) {
    const defaults2 = connectionDefaultsForType(connection?.type ?? "postgres");
    return {
      id: connection?.id,
      name: connection?.name ?? defaults2.name,
      type: connection?.type ?? "postgres",
      host: connection?.host ?? "localhost",
      port: String(connection?.port ?? defaults2.port),
      database: connection?.database ?? defaults2.database,
      username: connection?.username ?? "",
      password: "",
      sslMode: connection?.sslMode ?? defaults2.sslMode,
      defaultSchema: connection?.defaultSchema ?? "public",
      color: connection?.color ?? defaults2.color,
      connectTimeoutMs: connection?.connectTimeoutMs ? String(connection.connectTimeoutMs) : "",
      queryTimeoutMs: connection?.queryTimeoutMs ? String(connection.queryTimeoutMs) : String(vscode18.workspace.getConfiguration("database").get("query.timeoutMs", 3e5)),
      production: connection?.production ?? false,
      readOnlyDefault: connection?.readOnlyDefault ?? false
    };
  }
  html(webview, form) {
    const nonce = getNonce();
    const data = JSON.stringify(form).replace(/</g, "\\u003c");
    const connections = JSON.stringify(this.connectionManager.getConnections()).replace(/</g, "\\u003c");
    const defaults2 = JSON.stringify(DEFAULTS_BY_DATABASE_TYPE).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-elevated: var(--vscode-dropdown-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --bg-active: var(--vscode-list-activeSelectionBackground);
      --bg-selected: var(--vscode-list-inactiveSelectionBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --text-disabled: var(--vscode-disabledForeground);
      --accent: var(--vscode-focusBorder);
      --danger: var(--vscode-errorForeground);
      --success: var(--vscode-testing-iconPassed);
      --space-xxs: clamp(0.125rem, 0.1rem + 0.1vw, 0.25rem);
      --space-xs: clamp(0.25rem, 0.2rem + 0.15vw, 0.375rem);
      --space-sm: clamp(0.375rem, 0.3rem + 0.2vw, 0.5rem);
      --space-md: clamp(0.5rem, 0.45rem + 0.3vw, 0.75rem);
      --space-lg: clamp(0.75rem, 0.65rem + 0.4vw, 1rem);
      --icon-size: clamp(0.9rem, 0.82rem + 0.25vw, 1.1rem);
      --toolbar-button-size: clamp(1.55rem, 1.35rem + 0.55vw, 1.95rem);
      --row-height: clamp(1.45rem, 1.25rem + 0.45vw, 1.8rem);
      --tab-height: clamp(1.75rem, 1.55rem + 0.45vw, 2.15rem);
      --radius-sm: 0.25rem;
      --radius-md: 0.4rem;
      font-family: var(--vscode-font-family);
      font-size: clamp(0.75rem, 0.72rem + 0.15vw, 0.9rem);
      line-height: 1.35;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-main);
      font-family: var(--vscode-font-family);
      overflow: hidden;
    }
    button, input, select { font: inherit; }
    button {
      height: var(--toolbar-button-size);
      padding: 0 var(--space-sm);
      color: var(--text-main);
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    button:hover:not(:disabled) {
      background: var(--bg-hover);
      border-color: var(--border);
    }
    button:focus-visible,
    input:focus-visible,
    select:focus-visible {
      outline: 1px solid var(--accent);
      outline-offset: -1px;
    }
    button:disabled {
      color: var(--text-disabled);
      cursor: default;
      opacity: .6;
    }
    .dialog-shell {
      height: 100vh;
      display: grid;
      place-items: center;
      padding: var(--space-lg);
      overflow: auto;
    }
    form.dialog {
      width: min(92vw, 68rem);
      max-height: min(90vh, 52rem);
      min-height: min(38rem, 90vh);
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      border: 1px solid var(--border);
      background: var(--bg-main);
      box-shadow: 0 1rem 2.6rem color-mix(in srgb, black 34%, transparent);
      overflow: hidden;
    }
    .dialog-titlebar {
      min-height: clamp(2.4rem, 2.15rem + .6vw, 3rem);
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-md);
      padding: var(--space-sm) var(--space-md);
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
    }
    .dialog-titlebar h1 {
      margin: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 1.04rem;
      font-weight: 600;
    }
    .close {
      width: var(--toolbar-button-size);
      padding: 0;
      font-size: 1.05rem;
    }
    .dialog-body {
      min-height: 0;
      display: grid;
      grid-template-columns: clamp(12rem, 22vw, 17rem) minmax(0, 1fr);
      overflow: hidden;
    }
    .sidebar {
      min-width: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      border-right: 1px solid var(--border);
      background: var(--bg-panel);
      overflow: hidden;
    }
    .sidebar-header {
      padding: var(--space-sm);
      border-bottom: 1px solid var(--border);
    }
    .section-label {
      display: block;
      margin-bottom: var(--space-xs);
      color: var(--text-muted);
      font-size: .86em;
      font-weight: 600;
      text-transform: uppercase;
    }
    .rail-toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-xxs);
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .icon-button {
      width: var(--toolbar-button-size);
      padding: 0;
      display: inline-grid;
      place-items: center;
      color: var(--vscode-icon-foreground, var(--text-muted));
      flex: 0 0 auto;
    }
    .data-source-list {
      min-height: 0;
      overflow: auto;
      padding: var(--space-xs) 0;
    }
    .source-row {
      width: 100%;
      height: var(--row-height);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      border: 0;
      border-radius: 0;
      background: transparent;
      text-align: left;
    }
    .source-row.active {
      background: var(--bg-active);
      color: var(--vscode-list-activeSelectionForeground, var(--text-main));
    }
    .db-icon {
      color: var(--vscode-charts-blue);
      font-size: var(--icon-size);
      line-height: 1;
    }
    .source-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .status-dot {
      width: .45rem;
      height: .45rem;
      border-radius: 50%;
      background: var(--success);
    }
    .problems {
      padding: var(--space-sm);
      border-top: 1px solid var(--border);
      color: var(--text-muted);
    }
    .content {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      overflow: hidden;
      background: var(--bg-main);
    }
    .top-fields {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto minmax(11rem, 14rem) auto minmax(7rem, 10rem);
      gap: var(--space-sm);
      align-items: center;
      padding: var(--space-md);
      border-bottom: 1px solid var(--border);
    }
    .field-label {
      color: var(--text-muted);
      white-space: nowrap;
    }
    input,
    select {
      min-width: 0;
      height: var(--toolbar-button-size);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--border));
      border-radius: var(--radius-sm);
      padding: 0 var(--space-sm);
    }
    select {
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      border-color: var(--vscode-dropdown-border, var(--border));
    }
    .comment-link {
      grid-column: 2 / 3;
      justify-self: start;
      height: auto;
      padding: 0;
      color: var(--accent);
      border: 0;
      background: transparent;
    }
    .tabs {
      display: flex;
      align-items: flex-end;
      gap: var(--space-xxs);
      min-width: 0;
      padding: var(--space-xs) var(--space-md) 0;
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .tab {
      height: var(--tab-height);
      padding: 0 var(--space-md);
      color: var(--text-muted);
      border-color: transparent;
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      white-space: nowrap;
    }
    .tab.active {
      color: var(--text-main);
      background: var(--bg-main);
      border-color: var(--border);
      border-bottom-color: var(--bg-main);
    }
    .tab-panel {
      min-height: 0;
      display: none;
      overflow: auto;
      padding: var(--space-md);
    }
    .tab-panel.active { display: block; }
    .form-grid {
      display: grid;
      grid-template-columns: minmax(8rem, 11rem) minmax(0, 1fr) minmax(5rem, 8rem);
      gap: var(--space-sm);
      align-items: center;
      max-width: 56rem;
    }
    .full-row {
      grid-column: 2 / -1;
      min-width: 0;
    }
    .segment {
      display: inline-flex;
      align-items: stretch;
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .segment button {
      border: 0;
      border-right: 1px solid var(--border);
      border-radius: 0;
      color: var(--text-muted);
      background: var(--bg-elevated);
    }
    .segment button:last-child { border-right: 0; }
    .segment button.active {
      color: var(--text-main);
      background: var(--bg-selected);
    }
    .inline-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(5rem, 8rem);
      gap: var(--space-sm);
      min-width: 0;
    }
    .password-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(7rem, 10rem);
      gap: var(--space-sm);
      align-items: center;
      min-width: 0;
    }
    .url-field {
      font-family: var(--vscode-editor-font-family);
    }
    .schemas-layout {
      min-height: 20rem;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      border: 1px solid var(--border);
      background: var(--bg-panel);
    }
    .schema-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(9rem, 16rem);
      gap: var(--space-sm);
      align-items: center;
      padding: var(--space-xs) var(--space-sm);
      border-bottom: 1px solid var(--border);
    }
    .schema-tree {
      min-height: 0;
      overflow: auto;
      padding: var(--space-xs) 0;
    }
    .schema-row {
      min-height: var(--row-height);
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr);
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      text-align: left;
      width: 100%;
      border-radius: 0;
      border: 0;
      background: transparent;
      color: var(--text-main);
    }
    .schema-row.active {
      background: var(--bg-active);
      color: var(--vscode-list-activeSelectionForeground, var(--text-main));
    }
    .schema-row.child { padding-left: calc(var(--space-lg) * 1.6); }
    .schema-row input[type="checkbox"],
    .check input[type="checkbox"] {
      width: 1rem;
      height: 1rem;
      accent-color: var(--accent);
      padding: 0;
    }
    .schema-footer {
      display: grid;
      gap: var(--space-sm);
      padding: var(--space-sm);
      border-top: 1px solid var(--border);
      background: var(--bg-main);
    }
    .pattern {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--space-sm);
      align-items: center;
    }
    .pattern code {
      overflow: auto;
      padding: var(--space-xs);
      border: 1px solid var(--border);
      background: var(--bg-elevated);
      font-family: var(--vscode-editor-font-family);
      white-space: nowrap;
    }
    .checks {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-md);
      align-items: center;
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--text-main);
    }
    .advanced-grid {
      display: grid;
      grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
      gap: var(--space-sm);
      max-width: 42rem;
      align-items: center;
    }
    .empty-state {
      color: var(--text-muted);
      padding: var(--space-md);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .dialog-actions {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: var(--space-md);
      align-items: center;
      padding: var(--space-sm) var(--space-md);
      border-top: 1px solid var(--border);
      background: var(--bg-panel);
    }
    .button-row {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-xs);
    }
    .primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-border, transparent);
    }
    .primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    .secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border-color: var(--vscode-button-border, transparent);
    }
    #status {
      min-width: 0;
      min-height: var(--toolbar-button-size);
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #status.error { color: var(--danger); }
    #status.success { color: var(--success); }
    #status.testing::before {
      content: "";
      width: .75rem;
      height: .75rem;
      border-radius: 50%;
      border: 2px solid var(--accent);
      border-top-color: transparent;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 760px) {
      .dialog-shell { padding: 0; place-items: stretch; }
      form.dialog { width: 100vw; min-height: 100vh; max-height: 100vh; border: 0; }
      .dialog-body { grid-template-columns: minmax(0, 1fr); }
      .sidebar { display: none; }
      .top-fields,
      .form-grid,
      .advanced-grid,
      .schema-toolbar { grid-template-columns: minmax(0, 1fr); }
      .comment-link,
      .full-row { grid-column: 1 / -1; }
      .password-row,
      .inline-row { grid-template-columns: minmax(0, 1fr); }
    }
  </style>
</head>
<body>
  <div class="dialog-shell">
    <form id="form" class="dialog">
      <div class="dialog-titlebar">
        <h1>Data Sources and Drivers</h1>
        <button type="button" id="cancelTop" class="close" aria-label="Close">\xD7</button>
      </div>
      <div class="dialog-body">
        <aside class="sidebar" aria-label="Data sources">
          <div class="sidebar-header">
            <span class="section-label">Data Sources</span>
            <div class="rail-toolbar" role="toolbar" aria-label="Data source actions">
              <button type="button" class="icon-button" title="Add data source" aria-label="Add data source">\uFF0B</button>
              <button type="button" class="icon-button" title="Remove data source" aria-label="Remove data source">\u2212</button>
            </div>
          </div>
          <div class="data-source-list">
            <button type="button" class="source-row active">
              <span class="db-icon">\u25A3</span>
              <span class="source-name" id="sourceName">Connection</span>
              <span class="status-dot" title="Configured"></span>
            </button>
          </div>
        </aside>
        <section class="content">
          <div class="top-fields">
            <span class="field-label">Name:</span>
            <input name="name" autocomplete="off" aria-label="Connection name">
            <span class="field-label">Driver:</span>
            <select name="type" id="typeField" aria-label="Database type">
              <option value="postgres">PostgreSQL</option>
              <option value="redshift">Amazon Redshift</option>
            </select>
            <span class="field-label">Color:</span>
            <select name="color" aria-label="Connection color">
              <option>green</option>
              <option>blue</option>
              <option>purple</option>
              <option>yellow</option>
              <option>red</option>
              <option>gray</option>
            </select>
          </div>
          <div class="tabs" role="tablist" aria-label="Connection settings">
            <button type="button" class="tab active" data-tab="general" role="tab" aria-selected="true">General</button>
            <button type="button" class="tab" data-tab="options" role="tab">Options</button>
            <button type="button" class="tab" data-tab="ssh" role="tab">SSH/SSL</button>
            <button type="button" class="tab" data-tab="schemas" role="tab">Schemas</button>
          </div>
          <div class="tab-panel active" data-panel="general">
            <div class="form-grid">
              <span class="field-label">Connection type:</span>
              <div class="segment full-row" role="group" aria-label="Connection type">
                <button type="button" data-db-type="postgres">default</button>
                <button type="button" data-db-type="redshift">IAM cluster/region</button>
              </div>
              <span class="field-label">Host:</span>
              <div class="inline-row full-row">
                <input name="host" autocomplete="off" aria-label="Host">
                <input name="port" inputmode="numeric" aria-label="Port">
              </div>
              <span class="field-label">User:</span>
              <input class="full-row" name="username" autocomplete="off" aria-label="Username">
              <span class="field-label">Password:</span>
              <div class="password-row full-row">
                <input name="password" type="password" placeholder="${form.id ? "Leave blank to keep existing password" : ""}" aria-label="Password">
              </div>
              <span class="field-label">Database:</span>
              <input class="full-row" name="database" autocomplete="off" aria-label="Database">
              <span class="field-label">URL:</span>
              <input class="full-row url-field" id="urlPreview" readonly aria-label="JDBC URL preview">
            </div>
          </div>
          <div class="tab-panel" data-panel="options">
            <div class="advanced-grid">
              <span class="field-label">Read mode:</span>
              <label class="check"><input name="readOnlyDefault" type="checkbox">Read-only by default</label>
              <span class="field-label">Environment:</span>
              <label class="check"><input name="production" type="checkbox">Production connection</label>
              <span class="field-label">Connect timeout ms:</span>
              <input name="connectTimeoutMs" inputmode="numeric" aria-label="Connect timeout milliseconds">
              <span class="field-label">Query timeout ms:</span>
              <input name="queryTimeoutMs" inputmode="numeric" aria-label="Query timeout milliseconds">
            </div>
          </div>
          <div class="tab-panel" data-panel="ssh">
            <div class="advanced-grid">
              <span class="field-label">SSL mode:</span>
              <select name="sslMode" aria-label="SSL mode"><option>disable</option><option>prefer</option><option>require</option></select>
            </div>
          </div>
          <div class="tab-panel" data-panel="schemas">
            <div class="advanced-grid">
              <span class="field-label">Default schema:</span>
              <input name="defaultSchema" autocomplete="off" aria-label="Default schema">
            </div>
          </div>
        </section>
      </div>
      <div class="dialog-actions">
        <button type="button" id="test" class="secondary">Test Connection</button>
        <div id="status" aria-live="polite"></div>
        <div class="button-row">
          <button type="button" id="cancel" class="secondary">Cancel</button>
          <button type="button" id="save" class="primary">OK</button>
        </div>
      </div>
    </form>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const formData = ${data};
    const allConnections = ${connections};
    const defaultsByType = ${defaults2};
    const form = document.getElementById('form');
    const connectionList = allConnections.map((connection) => ({ ...connection }));
    let selectedId = formData.id ?? (connectionList[0]?.id || 'new');
    let draftActive = !formData.id;
    for (const [key, value] of Object.entries(formData)) {
      const field = form.elements.namedItem(key);
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = value === true;
      else field.value = value ?? '';
    }
    let previousType = formData.type || 'postgres';
    const typeField = form.elements.namedItem('type');
    const sourceName = document.getElementById('sourceName');
    const urlPreview = document.getElementById('urlPreview');
    const typeButtons = Array.from(document.querySelectorAll('[data-db-type]'));
    const tabs = Array.from(document.querySelectorAll('[data-tab]'));
    const panels = Array.from(document.querySelectorAll('[data-panel]'));
    const addButton = document.querySelector('.rail-toolbar button[title="Add data source"]');
    const removeButton = document.querySelector('.rail-toolbar button[title="Remove data source"]');
    const sourceRows = document.querySelector('.data-source-list');
    function connectionLabel(connection) {
      return connection.name || defaultsByType[connection.type || 'postgres'].name;
    }
    function renderSourceList() {
      const selected = selectedId;
      sourceRows.innerHTML = '';
      const draftRow = document.createElement('button');
      draftRow.type = 'button';
      draftRow.className = 'source-row' + (selected === 'new' ? ' active' : '');
      draftRow.innerHTML = '<span class="db-icon">\uFF0B</span><span class="source-name">New connection</span><span class="status-dot" title="Draft"></span>';
      draftRow.addEventListener('click', () => selectConnection('new'));
      sourceRows.appendChild(draftRow);
      for (const connection of connectionList) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'source-row' + (selected === connection.id ? ' active' : '');
        row.innerHTML = '<span class="db-icon">\u25A3</span><span class="source-name"></span><span class="status-dot" title="Configured"></span>';
        row.querySelector('.source-name').textContent = connectionLabel(connection);
        row.addEventListener('click', () => selectConnection(connection.id));
        sourceRows.appendChild(row);
      }
    }
    function loadConnection(connection) {
      const next = connection || {
        id: undefined,
        name: defaultsByType[form.elements.namedItem('type').value || 'postgres'].name,
        type: form.elements.namedItem('type').value || 'postgres',
        host: 'localhost',
        port: defaultsByType[form.elements.namedItem('type').value || 'postgres'].port,
        database: defaultsByType[form.elements.namedItem('type').value || 'postgres'].database,
        username: '',
        password: '',
        sslMode: defaultsByType[form.elements.namedItem('type').value || 'postgres'].sslMode,
        defaultSchema: 'public',
        color: defaultsByType[form.elements.namedItem('type').value || 'postgres'].color
      };
      for (const [key, value] of Object.entries(next)) {
        const field = form.elements.namedItem(key);
        if (!field) continue;
        if (field.type === 'checkbox') field.checked = value === true;
        else field.value = value ?? '';
      }
      formData.id = next.id;
      previousType = form.elements.namedItem('type').value || 'postgres';
      draftActive = !next.id;
      syncDerivedFields();
      renderSourceList();
    }
    function selectConnection(id) {
      selectedId = id;
      if (id === 'new') {
        loadConnection({
          type: typeField.value || 'postgres',
          name: defaultsByType[typeField.value || 'postgres'].name,
          host: 'localhost',
          port: defaultsByType[typeField.value || 'postgres'].port,
          database: defaultsByType[typeField.value || 'postgres'].database,
          username: '',
          password: '',
          sslMode: defaultsByType[typeField.value || 'postgres'].sslMode,
          defaultSchema: 'public',
          color: defaultsByType[typeField.value || 'postgres'].color
        });
        return;
      }
      const existing = connectionList.find((connection) => connection.id === id);
      if (existing) {
        loadConnection({
          ...existing,
          password: ''
        });
      }
    }
    function syncDerivedFields() {
      const name = form.elements.namedItem('name').value || 'Connection';
      const type = typeField.value;
      const host = form.elements.namedItem('host').value || 'host';
      const port = form.elements.namedItem('port').value || '';
      const database = form.elements.namedItem('database').value || 'database';
      sourceName.textContent = name;
      urlPreview.value = 'jdbc:' + (type === 'redshift' ? 'redshift' : 'postgresql') + '://' + host + (port ? ':' + port : '') + '/' + database;
      typeButtons.forEach((button) => button.classList.toggle('active', button.dataset.dbType === type));
      renderSourceList();
    }
    function applyDefaultsForType(nextType) {
      const previousDefaults = defaultsByType[previousType] || defaultsByType.postgres;
      const nextDefaults = defaultsByType[nextType] || defaultsByType.postgres;
      for (const name of ['name', 'port', 'database', 'sslMode', 'color']) {
        const field = form.elements.namedItem(name);
        if (!field) continue;
        if (!field.value || field.value === previousDefaults[name]) {
          field.value = nextDefaults[name];
        }
      }
      previousType = nextType;
    }
    typeField.addEventListener('change', () => {
      const nextType = typeField.value;
      applyDefaultsForType(nextType);
      syncDerivedFields();
    });
    typeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        typeField.value = button.dataset.dbType;
        typeField.dispatchEvent(new Event('change'));
      });
    });
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.dataset.tab;
        tabs.forEach((item) => {
          item.classList.toggle('active', item === tab);
          item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
        });
        panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === id));
      });
    });
    for (const name of ['name', 'host', 'port', 'database', 'defaultSchema']) {
      form.elements.namedItem(name)?.addEventListener('input', syncDerivedFields);
    }
    form.elements.namedItem('type')?.addEventListener('change', syncDerivedFields);
    addButton.addEventListener('click', () => selectConnection('new'));
    removeButton.addEventListener('click', () => {
      if (selectedId === 'new') {
        const fallback = connectionList[0];
        selectedId = fallback?.id || 'new';
        selectConnection(selectedId);
        return;
      }
      const id = selectedId;
      if (!id) return;
      vscode.postMessage({ type: 'delete', id });
    });
    function collect() {
      const data = {};
      for (const element of form.elements) {
        if (!element.name) continue;
        data[element.name] = element.type === 'checkbox' ? element.checked : element.value;
      }
      data.id = formData.id;
      return data;
    }
    document.getElementById('save').addEventListener('click', () => vscode.postMessage({ type: 'save', config: collect() }));
    document.getElementById('test').addEventListener('click', () => vscode.postMessage({ type: 'test', config: collect() }));
    document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    document.getElementById('cancelTop').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    window.addEventListener('message', event => {
      if (event.data?.type === 'connections') {
        connectionList.splice(0, connectionList.length, ...(event.data.connections || []));
        if (event.data.selectedId) {
          selectedId = event.data.selectedId;
        }
        if (selectedId === 'new' || !connectionList.some((connection) => connection.id === selectedId)) {
          selectedId = connectionList[0]?.id || 'new';
        }
        renderSourceList();
        if (selectedId === 'new') {
          selectConnection('new');
        } else {
          const active = connectionList.find((connection) => connection.id === selectedId);
          if (active) {
            loadConnection({ ...active, password: '' });
          }
        }
        return;
      }
      const status = document.getElementById('status');
      status.className = event.data.state || '';
      status.textContent = event.data.message || '';
      const testing = event.data.state === 'testing';
      document.getElementById('save').disabled = testing;
      document.getElementById('test').disabled = testing;
    });
    renderSourceList();
    if (formData.id) {
      selectConnection(formData.id);
    } else {
      selectConnection('new');
    }
  </script>
</body>
</html>`;
  }
};
function toOptionalNumber(value) {
  if (!value) {
    return void 0;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : void 0;
}
function getNonce() {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}

// src/webviews/queryMap/QueryMapProvider.ts
var vscode19 = __toESM(require("vscode"));
var PROJECT_SQL_SESSION_PREFIX = "project-sql:";
var QueryMapProvider = class {
  constructor(sectionService, revealSection, runSection, getHistoryItems, openHistoryItem, setConsolePinned, untrackConsole, moveConsole, touchConsoleDocument, updateHistoryItem, deleteHistoryItem, clearActiveSessions, clearHistoryItems, refreshData) {
    this.sectionService = sectionService;
    this.revealSection = revealSection;
    this.runSection = runSection;
    this.getHistoryItems = getHistoryItems;
    this.openHistoryItem = openHistoryItem;
    this.setConsolePinned = setConsolePinned;
    this.untrackConsole = untrackConsole;
    this.moveConsole = moveConsole;
    this.touchConsoleDocument = touchConsoleDocument;
    this.updateHistoryItem = updateHistoryItem;
    this.deleteHistoryItem = deleteHistoryItem;
    this.clearActiveSessions = clearActiveSessions;
    this.clearHistoryItems = clearHistoryItems;
    this.refreshData = refreshData;
  }
  static viewType = "databaseQueryMap";
  view;
  groups = [];
  historyGroups = [];
  consoleRecords = [];
  connections = [];
  activeConnectionIds = /* @__PURE__ */ new Set();
  runningDocumentUris = /* @__PURE__ */ new Set();
  resultTabs = [];
  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.html(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message) => void this.onMessage(message));
    this.postState();
  }
  updateConsoles(records, connections, activeConnectionIds = []) {
    this.consoleRecords = records;
    this.connections = connections;
    this.activeConnectionIds = new Set(activeConnectionIds);
    this.refreshGroups();
  }
  updateRunningDocuments(documentUris) {
    this.runningDocumentUris = new Set(documentUris);
    this.refreshGroups();
  }
  updateFromEditor(_editor) {
    this.refreshGroups();
  }
  refreshGroups() {
    const connectionById = new Map(this.connections.map((connection) => [connection.id, connection]));
    const groupsByConnection = /* @__PURE__ */ new Map();
    const todayStart = this.todayStart();
    for (const record of this.consoleRecords) {
      const connection = connectionById.get(record.connectionId);
      const touchedAt = record.lastTouchedAt ?? record.updatedAt;
      const isActiveConnection = this.activeConnectionIds.has(record.connectionId);
      const isToday = touchedAt >= todayStart;
      if (!record.pinned && !isActiveConnection && !isToday) {
        continue;
      }
      const connectionId = record.connectionId;
      const connectionName = connection?.name ?? "Unknown connection";
      const databaseName = connection?.database;
      const running = this.runningDocumentUris.has(record.documentUri);
      const group = groupsByConnection.get(connectionId) ?? {
        id: connectionId,
        connectionName,
        databaseName,
        documents: []
      };
      const latestResult = this.latestResultForDocument(record.documentUri);
      group.documents.push({
        id: record.id,
        documentUri: record.documentUri,
        documentTitle: this.documentTitle(record.documentUri),
        pinned: record.pinned === true,
        sortOrder: this.consoleSortValue(record),
        lastTouchedAt: touchedAt,
        isActiveConnection,
        isToday,
        running,
        projectFile: record.id.startsWith(PROJECT_SQL_SESSION_PREFIX),
        status: running ? "running" : latestResult?.executionStatus,
        durationMs: running ? void 0 : latestResult?.executionTimeMs,
        rowCount: running ? void 0 : latestResult?.rowCount,
        items: []
      });
      groupsByConnection.set(connectionId, group);
    }
    this.groups = [...groupsByConnection.values()].map((group) => ({
      ...group,
      documents: group.documents.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder || a.documentTitle.localeCompare(b.documentTitle))
    })).sort((a, b) => `${a.connectionName}:${a.databaseName ?? ""}`.localeCompare(`${b.connectionName}:${b.databaseName ?? ""}`));
    this.historyGroups = this.toHistoryGroups(this.getHistoryItems(), todayStart);
    this.postState();
  }
  documentTitle(documentUri) {
    try {
      const uri = vscode19.Uri.parse(documentUri);
      return uri.fsPath.split(/[\\/]/).pop() || uri.toString();
    } catch {
      return documentUri.split(/[\\/]/).pop() || documentUri;
    }
  }
  updateResults(tabs) {
    this.resultTabs = tabs;
    this.refreshGroups();
  }
  async onMessage(message) {
    if (message.type === "ready") {
      this.postState();
      return;
    }
    if (message.type === "refreshQuerySessions") {
      await this.refreshData();
      return;
    }
    if (message.type === "newConsole") {
      await vscode19.commands.executeCommand("database.openSqlConsole");
      return;
    }
    if (message.type === "clearActiveSessions") {
      const ids = this.groups.flatMap((group) => group.documents.map((document) => document.id));
      if (!ids.length) {
        return;
      }
      const answer = await vscode19.window.showWarningMessage("Clear active query sessions?", { modal: true }, "Clear");
      if (answer === "Clear") {
        await this.clearActiveSessions(ids);
      }
      return;
    }
    if (message.type === "clearConsoleHistory") {
      const ids = this.historyGroups.flatMap((group) => group.items.map((item) => item.id));
      if (!ids.length) {
        return;
      }
      const answer = await vscode19.window.showWarningMessage("Clear console history?", { modal: true }, "Clear");
      if (answer === "Clear") {
        await this.clearHistoryItems(ids);
      }
      return;
    }
    if (message.type === "togglePin") {
      await this.setConsolePinned(message.consoleId, message.pinned);
      return;
    }
    if (message.type === "untrackConsole") {
      await this.untrackConsole(message.consoleId);
      return;
    }
    if (message.type === "moveConsole") {
      await this.moveConsole(message.consoleId, message.direction);
      return;
    }
    if (message.type === "openHistory") {
      const item = this.getHistoryItems().find((history) => history.id === message.historyId);
      if (item) {
        await this.openHistoryItem(item);
      }
      return;
    }
    if (message.type === "toggleFavoriteHistory") {
      const item = this.getHistoryItems().find((history) => history.id === message.historyId);
      if (item) {
        await this.updateHistoryItem({ ...item, favorite: message.favorite });
      }
      return;
    }
    if (message.type === "copyHistory") {
      const item = this.getHistoryItems().find((history) => history.id === message.historyId);
      if (item) {
        await vscode19.env.clipboard.writeText(item.sql);
      }
      return;
    }
    if (message.type === "deleteHistory") {
      await this.deleteHistoryItem(message.historyId);
      return;
    }
    if (message.type === "openConsole") {
      const opened2 = await this.openDocument(message.documentUri, { showMissingWarning: false });
      if (opened2.editor) {
        await this.touchConsoleDocument(message.documentUri);
      } else if (opened2.missing) {
        await this.untrackConsole(message.consoleId);
        void vscode19.window.showInformationMessage("SQL console file no longer exists. Removed it from Active Session.");
      }
      return;
    }
    if (!message.documentUri) {
      return;
    }
    const opened = await this.openDocument(message.documentUri);
    if (!opened.editor) {
      return;
    }
    const editor = opened.editor;
    const node = this.findNodeById(this.sectionService.getTree(editor.document), message.nodeId);
    if (!node || !node.sql.trim()) {
      void vscode19.window.showInformationMessage("No SQL section to run.");
      return;
    }
    const section = this.toSectionNode(node);
    if (message.type === "reveal") {
      await this.revealSection(message.documentUri, section);
      return;
    }
    if (message.type === "run") {
      await this.revealSection(message.documentUri, section);
      await this.runSection(message.documentUri, section);
    }
  }
  async openDocument(documentUri, options = {}) {
    try {
      const document = await vscode19.workspace.openTextDocument(vscode19.Uri.parse(documentUri));
      const editor = await vscode19.window.showTextDocument(document, { preview: false, viewColumn: vscode19.ViewColumn.Active });
      return { editor, missing: false };
    } catch (error) {
      if (this.isFileNotFound(error)) {
        if (options.showMissingWarning !== false) {
          void vscode19.window.showWarningMessage("Source SQL file no longer exists.");
        }
        return { missing: true };
      }
      void vscode19.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return { missing: false };
    }
  }
  isFileNotFound(error) {
    const code = error instanceof vscode19.FileSystemError ? error.code : typeof error === "object" && error !== null ? error.code : void 0;
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    return code === "FileNotFound" || /\b(FileNotFound|ENOENT)\b/i.test(message);
  }
  toItem(documentUri, section) {
    const lastRun = this.resultFor(documentUri, section);
    return {
      id: section.id,
      documentUri,
      index: section.index,
      kind: section.kind,
      name: section.name,
      title: this.itemTitle(section),
      preview: this.previewSql(section.sql, 160),
      line: section.range.start.line + 1,
      disabled: !section.sql.trim(),
      range: {
        startLine: section.range.start.line,
        startColumn: section.range.start.character,
        endLine: section.range.end.line,
        endColumn: section.range.end.character
      },
      children: section.children.map((child) => this.toItem(documentUri, child)),
      ...lastRun
    };
  }
  resultFor(documentUri, section) {
    const tab = [...this.resultTabs].filter((item) => item.sourceDocumentUri === documentUri && (item.sourceQueryId === section.id || item.sourceSectionIndex === section.index)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!tab) {
      return {};
    }
    return {
      status: tab.executionStatus,
      durationMs: tab.executionTimeMs,
      rowCount: tab.rowCount
    };
  }
  previewSql(sql, maxLength) {
    return sql.split(/\r?\n/).map((line) => line.replace(/--.*$/, "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, maxLength);
  }
  itemTitle(section) {
    if (section.kind === "cte") {
      return section.name ? `CTE ${section.name}` : `CTE ${section.index + 1}`;
    }
    if (section.kind === "subquery") {
      return `Subquery ${section.index + 1}`;
    }
    return `Query ${section.index + 1}`;
  }
  postState() {
    void this.view?.webview.postMessage({
      type: "state",
      groups: this.groups,
      historyGroups: this.historyGroups
    });
  }
  latestResultForDocument(documentUri) {
    return [...this.resultTabs].filter((item) => item.sourceDocumentUri === documentUri).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
  toHistoryGroups(items, todayStart) {
    const connectionById = new Map(this.connections.map((connection) => [connection.id, connection]));
    const groups = /* @__PURE__ */ new Map();
    for (const item of [...items].filter((history) => history.executedAt < todayStart).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.executedAt - a.executedAt).slice(0, 100)) {
      const connection = connectionById.get(item.connectionId);
      const group = groups.get(item.connectionId) ?? {
        id: item.connectionId,
        connectionName: connection?.name ?? "Unknown connection",
        databaseName: connection?.database,
        items: []
      };
      group.items.push({
        id: item.id,
        connectionId: item.connectionId,
        sql: item.sql,
        preview: this.previewSql(item.sql, 180),
        status: item.status,
        favorite: item.favorite === true,
        rowCount: item.rowCount,
        executedAt: item.executedAt,
        sourceFile: item.sourceFile
      });
      groups.set(item.connectionId, group);
    }
    return [...groups.values()].sort((a, b) => `${a.connectionName}:${a.databaseName ?? ""}`.localeCompare(`${b.connectionName}:${b.databaseName ?? ""}`));
  }
  todayStart() {
    const now = /* @__PURE__ */ new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  consoleSortValue(record) {
    return record.sortOrder ?? -(record.lastTouchedAt ?? record.updatedAt);
  }
  findNodeById(nodes, nodeId) {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }
      const child = this.findNodeById(node.children, nodeId);
      if (child) {
        return child;
      }
    }
    return void 0;
  }
  toSectionNode(node) {
    return {
      ...node,
      aliases: this.sectionService.extractAliases(node.sql),
      tables: this.sectionService.extractTables(node.sql)
    };
  }
  html(webview) {
    const nonce = Date.now().toString();
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-elevated: var(--vscode-dropdown-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --bg-selected: var(--vscode-list-inactiveSelectionBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --text-disabled: var(--vscode-disabledForeground);
      --accent: var(--vscode-focusBorder);
      --danger: var(--vscode-errorForeground);
      --success: var(--vscode-testing-iconPassed);
      --space-xxs: clamp(0.125rem, 0.1rem + 0.1vw, 0.25rem);
      --space-xs: clamp(0.25rem, 0.2rem + 0.15vw, 0.375rem);
      --space-sm: clamp(0.375rem, 0.3rem + 0.2vw, 0.5rem);
      --space-md: clamp(0.5rem, 0.45rem + 0.3vw, 0.75rem);
      --icon-size: clamp(0.9rem, 0.82rem + 0.25vw, 1.1rem);
      --toolbar-button-size: clamp(1.55rem, 1.35rem + 0.55vw, 1.95rem);
      --row-height: clamp(1.45rem, 1.25rem + 0.45vw, 1.8rem);
      --tab-height: clamp(1.75rem, 1.55rem + 0.45vw, 2.15rem);
      --radius-sm: 0.25rem;
      font-family: var(--vscode-font-family);
      font-size: clamp(0.75rem, 0.72rem + 0.15vw, 0.9rem);
      line-height: 1.35;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-panel);
      font-family: var(--vscode-font-family);
      overflow: hidden;
    }
    button {
      font: inherit;
      color: inherit;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    button:hover:not(:disabled) {
      background: var(--bg-hover);
      border-color: var(--border);
    }
    button:focus-visible {
      outline: 1px solid var(--accent);
      outline-offset: -1px;
    }
    button:disabled {
      color: var(--text-disabled);
      cursor: default;
      opacity: .55;
    }
    .services-shell {
      height: 100vh;
      min-width: 0;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      overflow: hidden;
      background: var(--bg-panel);
    }
    .services-header {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: var(--space-xs) var(--space-sm);
      border-bottom: 1px solid var(--border);
    }
    .title {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .toolbar {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xxs);
      min-width: 0;
    }
    .icon {
      width: var(--toolbar-button-size);
      height: var(--toolbar-button-size);
      display: inline-grid;
      place-items: center;
      padding: 0;
      color: var(--vscode-icon-foreground, var(--text-muted));
      flex: 0 0 auto;
    }
    .tree-toggle {
      position: relative;
      width: var(--icon-size);
      display: inline-block;
      color: currentColor;
      flex: 0 0 auto;
    }
    .tree-toggle {
      height: var(--icon-size);
    }
    .toolbar-svg {
      width: calc(var(--icon-size) * 1.1);
      height: calc(var(--icon-size) * 1.1);
      display: block;
      color: currentColor;
      pointer-events: none;
    }
    .tree-toggle::before {
      content: '';
      position: absolute;
      width: .42rem;
      height: .42rem;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
    }
    .tree-toggle::before {
      top: 50%;
      left: 50%;
      transform: translate(-55%, -50%) rotate(-45deg);
    }
    .tree-toggle.expanded::before {
      transform: translate(-55%, -62%) rotate(45deg);
    }
    .tabs {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--space-xxs);
      padding: var(--space-xxs) var(--space-sm) 0;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .tab {
      height: var(--tab-height);
      min-width: 0;
      padding: 0 var(--space-sm);
      color: var(--text-muted);
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      white-space: nowrap;
    }
    .tab.active {
      color: var(--text-main);
      background: var(--bg-main);
      border-color: var(--border);
      border-bottom-color: var(--bg-main);
    }
    .panel-layout {
      min-height: 0;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      overflow: hidden;
      background: var(--bg-main);
    }
    .services-tree {
      min-height: 0;
      overflow: auto;
      padding: var(--space-xs) 0;
      background: var(--bg-panel);
      scrollbar-width: thin;
    }
    .tree-group,
    .connection-header {
      height: var(--row-height);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      color: var(--text-main);
      font-weight: 600;
    }
    .connection-header {
      width: 100%;
      padding-left: calc(var(--space-md) + var(--space-sm));
      border: 0;
      border-radius: 0;
      text-align: left;
      font-weight: 500;
    }
    .tree-count {
      color: var(--text-muted);
      font-weight: 400;
      font-size: .9em;
    }
    .session-row {
      width: 100%;
      height: var(--row-height);
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr) auto auto;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm) 0 calc(var(--space-md) * 2.2);
      border: 0;
      border-radius: 0;
      text-align: left;
    }
    .session-row:hover,
    .session-row.selected {
      background: var(--bg-hover);
    }
    .session-row.selected {
      background: var(--bg-selected);
    }
    .session-icon {
      color: var(--vscode-charts-blue);
      font-size: var(--icon-size);
      line-height: 1;
    }
    .session-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .duration {
      color: var(--text-muted);
      font-size: .88em;
      font-variant-numeric: tabular-nums;
      justify-self: end;
    }
    .row-action {
      width: calc(var(--toolbar-button-size) * .92);
      height: calc(var(--toolbar-button-size) * .92);
      display: inline-grid;
      place-items: center;
      padding: 0;
      opacity: .35;
    }
    .session-row:hover .row-action,
    .row-action:focus-visible {
      opacity: 1;
    }
    .pin {
      color: var(--vscode-charts-yellow);
      opacity: 1;
    }
    .status {
      width: .48rem;
      height: .48rem;
      flex: 0 0 auto;
      border-radius: 50%;
      background: var(--text-muted);
    }
    .status-completed { background: var(--success); }
    .status-failed { background: var(--vscode-testing-iconFailed, var(--danger)); }
    .status-running,
    .status-queued {
      background: var(--vscode-progressBar-background, var(--accent));
      animation: pulse 1.1s ease-in-out infinite;
    }
    .status-cancelled { background: var(--vscode-testing-iconSkipped, var(--text-muted)); }
    .loader {
      width: .72rem;
      height: .72rem;
      flex: 0 0 auto;
      border-radius: 50%;
      border: 2px solid var(--vscode-progressBar-background, var(--accent));
      border-top-color: transparent;
      animation: spin .8s linear infinite;
    }
    .output {
      min-height: 0;
      display: grid;
      grid-template-rows: var(--tab-height) minmax(0, 1fr);
      border-top: 1px solid var(--border);
      background: var(--bg-main);
      overflow: hidden;
    }
    .output-tabs {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
    }
    .output-tabs span:first-child {
      color: var(--text-main);
      font-weight: 600;
    }
    .output-title {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--text-muted);
    }
    .output-log {
      margin: 0;
      padding: var(--space-sm);
      overflow: auto;
      color: var(--text-main);
      font-family: var(--vscode-editor-font-family);
      font-size: clamp(0.72rem, 0.7rem + 0.12vw, 0.86rem);
      white-space: pre-wrap;
      scrollbar-width: thin;
    }
    .log-time { color: var(--text-muted); }
    .log-success { color: var(--success); }
    .log-error { color: var(--danger); }
    .empty {
      min-height: 8rem;
      display: grid;
      place-items: center;
      padding: var(--space-md);
      color: var(--text-muted);
      text-align: center;
    }
    .menu {
      position: fixed;
      z-index: 20;
      min-width: 13rem;
      max-width: min(22rem, calc(100vw - 1rem));
      padding: var(--space-xxs) 0;
      background: var(--vscode-menu-background, var(--bg-elevated));
      color: var(--vscode-menu-foreground, var(--text-main));
      border: 1px solid var(--vscode-menu-border, var(--border));
      box-shadow: 0 .55rem 1.35rem color-mix(in srgb, black 32%, transparent);
    }
    .menu button {
      width: 100%;
      min-height: var(--row-height);
      display: grid;
      grid-template-columns: 1.25rem minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-sm);
      padding: 0 var(--space-sm);
      border: 0;
      border-radius: 0;
      text-align: left;
    }
    .menu button:hover:not(:disabled),
    .menu button:focus-visible {
      background: var(--vscode-menu-selectionBackground, var(--bg-hover));
      color: var(--vscode-menu-selectionForeground, var(--text-main));
    }
    .menu kbd {
      color: var(--text-muted);
      font: inherit;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
    @media (min-width: 42rem) {
      .panel-layout {
        grid-template-rows: minmax(0, 1fr);
      }
      .output {
        border-top: 0;
        border-left: 1px solid var(--border);
      }
    }
    @media (max-width: 25rem) {
      .duration,
      .row-action {
        display: none;
      }
      .session-row {
        grid-template-columns: auto auto minmax(0, 1fr);
      }
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    let saved = vscode.getState() || {};
    let currentState = { groups: [], historyGroups: [] };
    let activeTab = saved.activeTab || 'active';
    let selected = saved.selected || undefined;
    let expanded = saved.expanded || {};
    let openMenuNode;

    function saveState() {
      vscode.setState({ activeTab, selected, expanded });
    }

    function render(state) {
      currentState = state || { groups: [], historyGroups: [] };
      root.innerHTML = '';
      closeMenu();
      const shell = document.createElement('div');
      shell.className = 'services-shell';
      shell.appendChild(renderHeader());
      shell.appendChild(renderTabs());
      shell.appendChild(activeTab === 'history' ? renderHistory() : renderActive());
      root.appendChild(shell);
    }

    function renderHeader() {
      const header = document.createElement('div');
      header.className = 'services-header';
      const toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      toolbar.setAttribute('role', 'toolbar');
      toolbar.setAttribute('aria-label', 'Query session actions');
      toolbar.appendChild(icon('+', 'New query console', () => vscode.postMessage({ type: 'newConsole' })));
      toolbar.appendChild(icon('\u21BB', 'Refresh', () => vscode.postMessage({ type: 'refreshQuerySessions' })));
      toolbar.appendChild(toolbarIcon('expand-all', 'Expand all', () => setAllExpanded(true)));
      toolbar.appendChild(toolbarIcon('collapse-all', 'Collapse all', () => setAllExpanded(false)));
      header.appendChild(toolbar);
      return header;
    }

    function renderTabs() {
      const tabs = document.createElement('div');
      tabs.className = 'tabs';
      tabs.appendChild(tabButton('active', 'Database'));
      tabs.appendChild(tabButton('history', 'History'));
      return tabs;
    }

    function tabButton(id, label) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tab' + (activeTab === id ? ' active' : '');
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', activeTab === id ? 'true' : 'false');
      button.textContent = label;
      button.onclick = () => {
        activeTab = id;
        saveState();
        render(currentState);
      };
      return button;
    }

    function hasActiveItems() {
      return (currentState.groups || []).some(group => (group.documents || []).length);
    }

    function hasHistoryItems() {
      return (currentState.historyGroups || []).some(group => (group.items || []).length);
    }

    function openNewest(id) {
      if (id === 'history') {
        const item = newestHistoryItem();
        if (item) vscode.postMessage({ type: 'openHistory', historyId: item.id });
        return;
      }
      const item = newestActiveItem();
      if (item) vscode.postMessage({ type: 'openConsole', consoleId: item.id, documentUri: item.documentUri });
    }

    function renderActive() {
      const groups = currentState.groups || [];
      if (!groups.length) return empty('No active or recent query consoles.');
      const layout = document.createElement('div');
      layout.className = 'panel-layout';
      const list = document.createElement('div');
      list.className = 'services-tree';
      list.setAttribute('aria-label', 'Database query sessions');
      for (const group of groups) {
        const key = groupKey('active', group);
        list.appendChild(connectionHeader(group, key));
        if (isExpanded(key)) {
          for (const documentGroup of group.documents) {
            list.appendChild(consoleRow(documentGroup));
          }
        }
      }
      layout.appendChild(list);
      return layout;
    }

    function renderHistory() {
      const groups = currentState.historyGroups || [];
      if (!groups.length) return empty('Older query console executions will appear here.');
      const layout = document.createElement('div');
      layout.className = 'panel-layout';
      const list = document.createElement('div');
      list.className = 'services-tree';
      list.setAttribute('aria-label', 'Query session history');
      for (const group of groups) {
        const key = groupKey('history', group);
        list.appendChild(connectionHeader(group, key));
        if (isExpanded(key)) {
          for (const item of group.items) {
            list.appendChild(historyRow(item));
          }
        }
      }
      layout.appendChild(list);
      return layout;
    }

    function consoleRow(item) {
      const row = sessionRow(item.documentTitle, item.running ? 'running...' : durationText(item.durationMs, item.status), item.running ? 'running' : item.status, selected && selected.type === 'active' && selected.id === item.id);
      row.onclick = () => {
        selected = { type: 'active', id: item.id };
        saveState();
        render(currentState);
        vscode.postMessage({ type: 'openConsole', consoleId: item.id, documentUri: item.documentUri });
      };
      row.oncontextmenu = (event) => openMenu(event, consoleActions(item));
      row.appendChild(icon('\u22EF', 'Console actions', (event) => openMenu(event, consoleActions(item)), item.pinned ? 'row-action pin' : 'row-action'));
      return row;
    }

    function historyRow(item) {
      const row = sessionRow(item.preview || item.sql, historyMeta(item), item.status, selected && selected.type === 'history' && selected.id === item.id);
      row.onclick = () => {
        selected = { type: 'history', id: item.id };
        saveState();
        render(currentState);
        vscode.postMessage({ type: 'openHistory', historyId: item.id });
      };
      row.oncontextmenu = (event) => openMenu(event, historyActions(item));
      row.appendChild(icon('\u22EF', 'Console history actions', (event) => openMenu(event, historyActions(item)), item.favorite ? 'row-action pin' : 'row-action'));
      return row;
    }

    function treeHeader(chevron, label, count) {
      const node = document.createElement('div');
      node.className = 'tree-group';
      node.innerHTML = '<span>' + chevron + '</span><span>' + escapeHtml(label) + '</span><span class="tree-count">' + escapeHtml(count) + '</span>';
      return node;
    }

    function connectionHeader(group, key) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'connection-header';
      const count = group.documents ? group.documents.length : (group.items ? group.items.length : 0);
      const open = isExpanded(key);
      node.setAttribute('aria-expanded', open ? 'true' : 'false');
      node.title = open ? 'Collapse connection' : 'Expand connection';
      node.onclick = () => toggleExpanded(key);
      node.appendChild(treeToggle(open));
      const label = document.createElement('span');
      label.textContent = group.connectionName + (group.databaseName ? ' / ' + group.databaseName : '');
      node.appendChild(label);
      const countNode = document.createElement('span');
      countNode.className = 'tree-count';
      countNode.textContent = String(count);
      node.appendChild(countNode);
      return node;
    }

    function groupKey(scope, group) {
      return scope + ':' + (group.id || group.connectionName + '/' + (group.databaseName || ''));
    }

    function isExpanded(key) {
      return expanded[key] !== false;
    }

    function toggleExpanded(key) {
      expanded = { ...expanded, [key]: !isExpanded(key) };
      saveState();
      render(currentState);
    }

    function setAllExpanded(value) {
      const scope = activeTab === 'history' ? 'history' : 'active';
      const groups = activeTab === 'history' ? (currentState.historyGroups || []) : (currentState.groups || []);
      const next = { ...expanded };
      for (const group of groups) {
        next[groupKey(scope, group)] = value;
      }
      expanded = next;
      saveState();
      render(currentState);
    }

    function treeToggle(open) {
      const node = document.createElement('span');
      node.className = 'tree-toggle' + (open ? ' expanded' : '');
      node.setAttribute('aria-hidden', 'true');
      return node;
    }

    function sessionRow(name, duration, status, isSelected) {
      const row = document.createElement('div');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.className = 'session-row' + (isSelected ? ' selected' : '');
      row.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          row.click();
        }
      };
      row.appendChild(status === 'running' ? loader() : statusDot(status || 'completed'));
      const iconNode = document.createElement('span');
      iconNode.className = 'session-icon';
      iconNode.textContent = '\u25A3';
      row.appendChild(iconNode);
      const nameNode = document.createElement('span');
      nameNode.className = 'session-name';
      nameNode.textContent = name;
      row.appendChild(nameNode);
      const durationNode = document.createElement('span');
      durationNode.className = 'duration';
      durationNode.textContent = duration || '';
      row.appendChild(durationNode);
      return row;
    }

    function consoleActions(item) {
      if (item.projectFile) {
        return [
          { icon: '\xD7', label: 'Remove from active session', run: () => vscode.postMessage({ type: 'untrackConsole', consoleId: item.id }) }
        ];
      }
      return [
        { icon: '\u2316', label: item.pinned ? 'Unpin console' : 'Pin console', run: () => vscode.postMessage({ type: 'togglePin', consoleId: item.id, pinned: !item.pinned }) },
        { icon: '\u2191', label: 'Move up', run: () => vscode.postMessage({ type: 'moveConsole', consoleId: item.id, direction: 'up' }) },
        { icon: '\u2193', label: 'Move down', run: () => vscode.postMessage({ type: 'moveConsole', consoleId: item.id, direction: 'down' }) },
        { icon: '\xD7', label: 'Untrack console', shortcut: 'Delete', run: () => vscode.postMessage({ type: 'untrackConsole', consoleId: item.id }) }
      ];
    }

    function historyActions(item) {
      return [
        { icon: '\u2316', label: item.favorite ? 'Remove favorite' : 'Favorite', run: () => vscode.postMessage({ type: 'toggleFavoriteHistory', historyId: item.id, favorite: !item.favorite }) },
        { icon: '\u29C9', label: 'Copy SQL', shortcut: 'Ctrl+C', run: () => vscode.postMessage({ type: 'copyHistory', historyId: item.id }) },
        { icon: '\xD7', label: 'Delete history item', shortcut: 'Delete', run: () => vscode.postMessage({ type: 'deleteHistory', historyId: item.id }) }
      ];
    }

    function openMenu(event, actions) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      const menu = document.createElement('div');
      menu.className = 'menu';
      for (const action of actions) {
        const item = document.createElement('button');
        item.type = 'button';
        item.innerHTML = '<span>' + escapeHtml(action.icon || '') + '</span><span>' + escapeHtml(action.label) + '</span><kbd>' + escapeHtml(action.shortcut || '') + '</kbd>';
        item.disabled = action.disabled === true;
        item.onclick = () => {
          if (action.disabled === true) return;
          closeMenu();
          action.run();
        };
        menu.appendChild(item);
      }
      document.body.appendChild(menu);
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      menu.style.left = Math.max(4, Math.min(event.clientX, window.innerWidth - width - 4)) + 'px';
      menu.style.top = Math.max(4, Math.min(event.clientY, window.innerHeight - height - 4)) + 'px';
      openMenuNode = menu;
      const first = menu.querySelector('button');
      if (first) first.focus();
    }

    function closeMenu() {
      if (openMenuNode) {
        openMenuNode.remove();
        openMenuNode = undefined;
      }
    }

    function icon(text, title, onclick, extraClass) {
      const button = document.createElement('button');
      button.className = 'icon' + (extraClass ? ' ' + extraClass : '');
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', title);
      button.textContent = text;
      button.onclick = (event) => {
        event.stopPropagation();
        onclick(event);
      };
      return button;
    }

    function toolbarIcon(kind, title, onclick) {
      const button = icon('', title, onclick);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('toolbar-svg');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const paths = kind === 'expand-all'
        ? ['M5 6 L8 3 L11 6', 'M5 10 L8 13 L11 10']
        : ['M5 4 L8 7 L11 4', 'M5 12 L8 9 L11 12'];
      for (const d of paths) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.8');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
      }
      button.appendChild(svg);
      return button;
    }

    function statusDot(status) {
      const dot = document.createElement('span');
      dot.className = 'status status-' + status;
      dot.title = status;
      return dot;
    }

    function loader() {
      const spinner = document.createElement('span');
      spinner.className = 'loader';
      spinner.title = 'running';
      return spinner;
    }

    function selectedActiveItem() {
      if (!selected || selected.type !== 'active') return undefined;
      return (currentState.groups || []).flatMap(group => group.documents || []).find(item => item.id === selected.id);
    }

    function newestActiveItem() {
      return (currentState.groups || []).flatMap(group => group.documents || []).sort((a, b) => b.lastTouchedAt - a.lastTouchedAt)[0];
    }

    function selectedHistoryItem() {
      if (!selected || selected.type !== 'history') return undefined;
      return (currentState.historyGroups || []).flatMap(group => group.items || []).find(item => item.id === selected.id);
    }

    function newestHistoryItem() {
      return (currentState.historyGroups || []).flatMap(group => group.items || []).sort((a, b) => b.executedAt - a.executedAt)[0];
    }

    function renderOutput(item) {
      const output = document.createElement('section');
      output.className = 'output';
      const header = document.createElement('div');
      header.className = 'output-tabs';
      const label = document.createElement('span');
      label.textContent = 'Output';
      const title = document.createElement('span');
      title.className = 'output-title';
      title.textContent = item ? (item.documentTitle || item.preview || item.sql || 'Session') : 'No session selected';
      header.appendChild(label);
      header.appendChild(title);
      output.appendChild(header);
      const log = document.createElement('pre');
      log.className = 'output-log';
      if (!item) {
        log.textContent = 'Select a session to inspect its latest state.';
      } else if (item.documentTitle) {
        log.innerHTML = activeLog(item);
      } else {
        log.innerHTML = historyLog(item);
      }
      output.appendChild(log);
      return output;
    }

    function activeLog(item) {
      const rows = [];
      rows.push('<span class="log-time">[' + shortTime(item.lastTouchedAt) + ']</span> Session ' + escapeHtml(item.documentTitle));
      if (item.running) rows.push('<span class="log-time">[' + shortTime(Date.now()) + ']</span> running...');
      if (item.status) rows.push('<span class="log-time">[' + shortTime(item.lastTouchedAt) + ']</span> status: ' + statusClassText(item.status));
      if (item.rowCount !== undefined) rows.push('<span class="log-time">[' + shortTime(item.lastTouchedAt) + ']</span> ' + item.rowCount + ' rows retrieved');
      if (item.durationMs !== undefined) rows.push('<span class="log-time">[' + shortTime(item.lastTouchedAt) + ']</span> execution: ' + formatDuration(item.durationMs));
      return rows.join('\\n');
    }

    function historyLog(item) {
      const rows = [];
      rows.push('<span class="log-time">[' + shortTime(item.executedAt) + ']</span> ' + statusClassText(item.status));
      if (item.rowCount !== undefined) rows.push('<span class="log-time">[' + shortTime(item.executedAt) + ']</span> ' + item.rowCount + ' rows retrieved');
      rows.push('');
      rows.push(escapeHtml(item.sql || item.preview || ''));
      return rows.join('\\n');
    }

    function statusClassText(status) {
      if (status === 'failed') return '<span class="log-error">' + escapeHtml(status) + '</span>';
      if (status === 'completed') return '<span class="log-success">' + escapeHtml(status) + '</span>';
      return escapeHtml(status || 'unknown');
    }

    function historyMeta(item) {
      return shortDate(item.executedAt);
    }

    function durationText(durationMs, status) {
      if (status === 'failed') return 'failed';
      if (durationMs === undefined || durationMs === null) return '';
      return formatDuration(durationMs);
    }

    function formatDuration(ms) {
      if (ms < 1000) return ms + ' ms';
      const seconds = Math.floor(ms / 1000);
      return seconds + ' s ' + (ms % 1000) + ' ms';
    }

    function shortDate(value) {
      if (!value) return '';
      const date = new Date(value);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return day + '/' + month + '/' + date.getFullYear();
    }

    function shortTime(value) {
      const date = new Date(value || Date.now());
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function empty(text) {
      const node = document.createElement('div');
      node.className = 'empty';
      node.textContent = text;
      return node;
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }

    window.addEventListener('message', (event) => {
      if (event.data.type === 'state') render(event.data);
    });
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
};

// src/webviews/results/ResultsPanelProvider.ts
var vscode20 = __toESM(require("vscode"));
var ResultsPanelProvider = class _ResultsPanelProvider {
  constructor(context, sessionStore, executor, revealSource, onTabsChanged, runActiveEditorSelection) {
    this.context = context;
    this.sessionStore = sessionStore;
    this.executor = executor;
    this.revealSource = revealSource;
    this.onTabsChanged = onTabsChanged;
    this.runActiveEditorSelection = runActiveEditorSelection;
    this.tabs = this.sessionStore.getTabs();
    this.activeTabId = this.tabs[0]?.id;
    this.activeConnectionId = this.tabs.find((tab) => tab.id === this.activeTabId)?.connectionId;
  }
  static viewType = "sqlResults";
  view;
  tabs;
  activeTabId;
  activeConnectionId;
  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode20.Uri.joinPath(this.context.extensionUri, "media", "results")]
    };
    webviewView.webview.html = this.html(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message) => this.onMessage(message));
  }
  async show(connectionId) {
    if (connectionId) {
      this.selectConnection(connectionId);
    }
    await vscode20.commands.executeCommand(`${_ResultsPanelProvider.viewType}.focus`);
    this.postHydrate();
  }
  setActiveConnection(connectionId) {
    this.selectConnection(connectionId);
    this.postHydrate();
  }
  async addTab(tab, options = {}) {
    this.activeConnectionId = tab.connectionId;
    let storedTab = tab;
    if (options.replaceTabId) {
      const existing = this.tabs.find((item) => item.id === options.replaceTabId);
      storedTab = { ...tab, id: existing?.id ?? options.replaceTabId };
      this.tabs = existing ? this.tabs.map((item) => item.id === storedTab.id ? storedTab : item) : [...this.tabs, storedTab];
      this.activeTabId = storedTab.id;
    } else {
      const active = options.forceNew ? void 0 : this.reusableTabFor(tab);
      if (active && !active.pinned) {
        storedTab = { ...tab, id: active.id };
        this.tabs = this.tabs.map((item) => item.id === active.id ? storedTab : item);
        this.activeTabId = active.id;
      } else {
        this.tabs.push(tab);
        this.activeTabId = tab.id;
      }
    }
    await this.sessionStore.saveTabs(this.tabs);
    this.onTabsChanged?.(this.tabs);
    await this.show();
    return storedTab;
  }
  getTabs() {
    return this.tabs;
  }
  getTab(id) {
    return this.tabs.find((tab) => tab.id === id);
  }
  async onMessage(message) {
    if (message.type === "ready") {
      this.postHydrate();
      return;
    }
    if (message.type === "activateTab") {
      this.activeTabId = message.tabId;
      const tab = this.getTab(message.tabId);
      if (tab) {
        this.activeConnectionId = tab.connectionId;
        await this.revealSource?.(tab);
      }
      return;
    }
    if (message.type === "pinTab") {
      this.tabs = this.tabs.map((tab) => tab.id === message.tabId ? { ...tab, pinned: message.pinned, updatedAt: Date.now() } : tab);
      await this.sessionStore.saveTabs(this.tabs);
      this.onTabsChanged?.(this.tabs);
      return;
    }
    if (message.type === "closeTab") {
      this.tabs = this.tabs.filter((tab) => tab.id !== message.tabId);
      this.activeTabId = this.visibleTabs()[0]?.id;
      await this.sessionStore.saveTabs(this.tabs);
      this.onTabsChanged?.(this.tabs);
      this.postHydrate();
      return;
    }
    if (message.type === "renameTab") {
      this.tabs = this.tabs.map((tab) => tab.id === message.tabId ? { ...tab, customTitle: message.title, updatedAt: Date.now() } : tab);
      await this.sessionStore.saveTabs(this.tabs);
      this.onTabsChanged?.(this.tabs);
      this.postHydrate();
      return;
    }
    if (message.type === "rerunTab") {
      const tab = this.getTab(message.tabId);
      if (tab) {
        const maxRows = typeof message.maxRows === "number" ? message.maxRows : message.maxRows === null ? void 0 : tab.maxRows;
        if (await this.runActiveEditorSelection?.(maxRows)) {
          return;
        }
        const started = Date.now();
        await this.addTab({
          ...tab,
          executionStatus: "running",
          executionStartedAt: started,
          executionFinishedAt: void 0,
          executionTimeMs: void 0,
          rowCount: void 0,
          maxRows,
          error: void 0,
          resultSets: [],
          activeResultSetIndex: 0,
          updatedAt: started
        }, { replaceTabId: tab.id });
        const next = await this.executor.execute({
          connectionId: tab.connectionId,
          sql: tab.queryText,
          maxRows,
          source: {
            origin: tab.sourceOrigin,
            fileName: tab.sourceFile,
            documentUri: tab.sourceDocumentUri,
            sectionIndex: tab.sourceSectionIndex,
            range: tab.sourceRange
          }
        });
        await this.addTab({ ...next, id: tab.id, pinned: tab.pinned, customTitle: tab.customTitle }, { replaceTabId: tab.id });
      }
      return;
    }
    if (message.type === "copy") {
      await vscode20.env.clipboard.writeText(message.text);
    }
  }
  post(message) {
    void this.view?.webview.postMessage(message);
  }
  postHydrate() {
    const tabs = this.visibleTabs();
    this.post({ type: "hydrate", tabs, activeTabId: this.activeTabId && tabs.some((tab) => tab.id === this.activeTabId) ? this.activeTabId : tabs[0]?.id });
  }
  selectConnection(connectionId) {
    this.activeConnectionId = connectionId;
    const tabs = this.visibleTabs();
    this.activeTabId = tabs.some((tab) => tab.id === this.activeTabId) ? this.activeTabId : [...tabs].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;
  }
  visibleTabs() {
    if (!this.activeConnectionId) {
      return this.tabs;
    }
    return this.tabs.filter((tab) => tab.connectionId === this.activeConnectionId);
  }
  reusableTabFor(tab) {
    if (tab.pinned) {
      return void 0;
    }
    const sameConnectionTabs = this.tabs.filter((item) => item.connectionId === tab.connectionId);
    const active = sameConnectionTabs.find((item) => item.id === this.activeTabId);
    if (active && !active.pinned) {
      return active;
    }
    return sameConnectionTabs.filter((item) => !item.pinned).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
  html(webview) {
    const script = webview.asWebviewUri(vscode20.Uri.joinPath(this.context.extensionUri, "media", "results", "results.js"));
    const style = webview.asWebviewUri(vscode20.Uri.joinPath(this.context.extensionUri, "media", "results", "results.css"));
    const nonce = Date.now().toString();
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${style}" rel="stylesheet">
  <title>SQL Results</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${script}"></script>
</body>
</html>`;
  }
};

// src/webviews/table/TableDataPanel.ts
var vscode21 = __toESM(require("vscode"));
var TableDataPanel = class {
  static async open(context, connectionManager, node) {
    const configuredMaxRows = vscode21.workspace.getConfiguration("database").get("defaultMaxRows", 500);
    const maxRows = Number.isFinite(configuredMaxRows) && configuredMaxRows && configuredMaxRows > 0 ? Math.floor(configuredMaxRows) : 500;
    const panel = vscode21.window.createWebviewPanel(
      "databaseTableData",
      node.table.name,
      vscode21.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    panel.iconPath = vscode21.Uri.joinPath(context.extensionUri, "media", "database.svg");
    panel.webview.html = this.html(panel.webview, node, [], [], 0, maxRows, false, true);
    let initialFetchStarted = false;
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "ready") {
        if (!initialFetchStarted) {
          initialFetchStarted = true;
          void this.postTableState(panel, connectionManager, node, maxRows);
        }
        return;
      }
      if (message.type === "copy" && typeof message.text === "string") {
        await vscode21.env.clipboard.writeText(message.text);
        return;
      }
      if (message.type === "export" && typeof message.text === "string" && message.format) {
        const target = await vscode21.window.showSaveDialog({
          defaultUri: vscode21.Uri.file(`${node.table.name}.${message.format}`),
          filters: { "Data files": [message.format] }
        });
        if (target) {
          await vscode21.workspace.fs.writeFile(target, Buffer.from(message.text, "utf8"));
        }
        return;
      }
      if (message.type === "command") {
        if (message.command === "ddl") {
          await vscode21.commands.executeCommand("database.showObjectDdl", node);
        }
        if (message.command === "select") {
          await vscode21.commands.executeCommand("database.generateSelect", node);
        }
        return;
      }
      if (message.type === "fetch") {
        const limit = Number.isFinite(message.limit) && message.limit && message.limit > 0 ? Math.floor(message.limit) : 0;
        const offset = Number.isFinite(message.offset) && message.offset && message.offset > 0 ? Math.floor(message.offset) : 0;
        await this.postTableState(panel, connectionManager, node, limit, {
          where: message.where,
          offset,
          orderBySql: message.orderBySql,
          orderBy: message.orderBy
        });
      }
    });
  }
  static async postTableState(panel, connectionManager, node, limit, options = {}) {
    try {
      if (!connectionManager.isConnected(node.connection.id)) {
        await connectionManager.connect(node.connection.id);
      }
      const nextResult = await connectionManager.getDriver(node.connection.type).getTablePreview(node.connection.id, node.table.schema, node.table.name, limit, options);
      const hasMore = limit > 0 && nextResult.rows.length > limit;
      await panel.webview.postMessage({
        type: "state",
        rows: hasMore ? nextResult.rows.slice(0, limit) : nextResult.rows,
        columns: nextResult.fields.map((field) => field.name),
        columnTypes: Object.fromEntries(nextResult.fields.map((field) => [field.name, { dataTypeId: field.dataTypeId, dataTypeName: field.dataTypeName }])),
        durationMs: nextResult.durationMs,
        limit,
        offset: options.offset ?? 0,
        hasMore
      });
    } catch (error) {
      await panel.webview.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  static html(webview, node, rows, columns, durationMs, maxRows, hasMore, initialLoading = false) {
    const nonce = Date.now().toString();
    const safeTable = escapeHtml(qualifiedName(node.table.schema, node.table.name));
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTable}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-header: var(--vscode-editorWidget-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --bg-active: var(--vscode-list-activeSelectionBackground);
      --bg-selected: var(--vscode-list-inactiveSelectionBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-editor-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-focusBorder);
      --space-xxs: clamp(0.125rem, 0.1rem + 0.1vw, 0.25rem);
      --space-xs: clamp(0.25rem, 0.2rem + 0.15vw, 0.375rem);
      --space-sm: clamp(0.375rem, 0.3rem + 0.2vw, 0.5rem);
      --space-md: clamp(0.5rem, 0.45rem + 0.3vw, 0.75rem);
      --icon-size: clamp(1.05rem, 0.98rem + 0.25vw, 1.25rem);
      --toolbar-button-size: clamp(1.85rem, 1.65rem + 0.55vw, 2.25rem);
      --row-height: 32px;
      --radius-sm: 0.25rem;
      font-family: var(--vscode-font-family);
      font-size: clamp(0.88rem, 0.84rem + 0.15vw, 1rem);
      line-height: 1.35;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-main);
      font-family: var(--vscode-font-family);
      overflow: hidden;
    }
    .shell {
      height: 100vh;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-xxs);
      min-width: 0;
      padding: var(--space-xs) var(--space-sm);
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .toolbar-separator {
      width: 1px;
      height: 1.15rem;
      margin: 0 var(--space-xs);
      background: var(--border);
    }
    .toolbar-spacer {
      flex: 1;
    }
    .criteria-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      border-bottom: 1px solid var(--border);
      background: var(--bg-header);
    }
    .criteria {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      min-width: 0;
      min-height: clamp(1.8rem, 1.6rem + 0.45vw, 2.2rem);
      padding: var(--space-xxs) var(--space-sm);
      color: var(--text-muted);
      background: var(--bg-header);
      border-right: 1px solid var(--border);
    }
    .criteria strong {
      color: var(--vscode-editor-foreground);
      font-weight: 500;
      letter-spacing: .04em;
      white-space: nowrap;
    }
    .criteria-icon {
      color: var(--vscode-descriptionForeground);
      font-size: 19px;
      line-height: 1;
      display: inline-grid;
      place-items: center;
    }
    .criteria:first-child .criteria-icon {
      color: var(--vscode-charts-blue);
    }
    .criteria:nth-child(2) .criteria-icon {
      color: var(--vscode-charts-purple);
    }
    .criteria input {
      flex: 1;
      min-width: 120px;
      height: var(--toolbar-button-size);
      padding: 0 var(--space-sm);
      color: var(--vscode-input-foreground);
      background: transparent;
      border: 0;
      font: inherit;
      outline: 0;
    }
    .criteria input:focus {
      background: var(--vscode-input-background);
      box-shadow: inset 0 -1px 0 var(--vscode-focusBorder);
    }
    .column-suggest {
      position: fixed;
      z-index: 30;
      width: min(26rem, calc(100vw - 1rem));
      max-height: min(18rem, 46vh);
      overflow: auto;
      padding: var(--space-xxs) 0;
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      box-shadow: 0 10px 26px rgba(0, 0, 0, .34);
      scrollbar-width: thin;
    }
    .column-suggest[hidden] {
      display: none;
    }
    .column-suggest button {
      width: 100%;
      min-height: 1.8rem;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-sm);
      padding: 0 var(--space-sm);
      border: 0;
      border-radius: 0;
      color: inherit;
      text-align: left;
    }
    .column-suggest button:hover,
    .column-suggest button.active {
      background: var(--vscode-list-hoverBackground);
    }
    .column-suggest-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-family: var(--vscode-editor-font-family);
    }
    .column-suggest-type {
      color: var(--text-muted);
      font-size: .9em;
    }
    button,
    select {
      height: var(--toolbar-button-size);
      align-self: center;
      color: var(--text-main);
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      font: inherit;
      padding: 0 var(--space-sm);
    }
    .icon-button {
      width: var(--toolbar-button-size);
      padding: 0;
      color: var(--text-muted);
      font-size: var(--icon-size);
      line-height: 1;
    }
    .icon-button[data-tone="blue"] {
      color: var(--vscode-charts-blue);
    }
    .icon-button[data-tone="green"] {
      color: var(--vscode-charts-green);
    }
    .icon-button[data-tone="orange"] {
      color: var(--vscode-charts-orange);
    }
    .icon-button[data-tone="purple"] {
      color: var(--vscode-charts-purple);
    }
    .icon-button[data-tone="red"] {
      color: var(--vscode-charts-red);
    }
    .icon-button.active {
      color: var(--vscode-focusBorder);
      background: var(--vscode-list-activeSelectionBackground);
      border-color: var(--vscode-focusBorder);
    }
    .tool-select {
      width: auto;
      min-width: 78px;
    }
    select {
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      border-color: var(--vscode-dropdown-border);
    }
    button:hover {
      background: var(--vscode-toolbar-hoverBackground);
      border-color: var(--vscode-panel-border);
    }
    .grid-wrap {
      position: relative;
      min-height: 0;
      overflow: hidden;
      background: var(--bg-main);
    }
    .grid {
      height: 100%;
      overflow: auto;
      padding-bottom: 44px;
      box-sizing: border-box;
    }
    table {
      border-collapse: collapse;
      width: max-content;
      min-width: 100%;
      table-layout: fixed;
    }
    col.rownum-col {
      width: clamp(2.65rem, 2.35rem + 0.6vw, 3.5rem);
    }
    col.data-col {
      width: clamp(10rem, 18vw, 15rem);
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--bg-header);
      color: var(--text-main);
      font-weight: 600;
      text-align: left;
      vertical-align: top;
    }
    th,
    td {
      height: var(--row-height);
      box-sizing: border-box;
      max-width: none;
      padding: 0.18rem var(--space-sm);
      border-right: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--border) 56%, transparent);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--vscode-editor-font-family);
      font-size: clamp(0.94rem, 0.9rem + 0.12vw, 1.05rem);
    }
    .header-button {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-width: 0;
      margin: 0;
      padding: 0;
      text-align: left;
      border: 0;
      font-size: 0.98rem;
      font-weight: 600;
    }
    .header-cell-actions {
      display: flex;
      align-items: center;
      gap: var(--space-xxs);
      width: 100%;
      min-width: 0;
    }
    .header-cell-actions .header-button {
      flex: 1 1 auto;
      width: auto;
    }
    .header-button span:nth-child(2) {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .column-type-icon {
      width: calc(var(--icon-size) * 0.9);
      height: calc(var(--icon-size) * 0.9);
      flex: 0 0 auto;
      border: 2px solid var(--vscode-descriptionForeground);
      border-radius: 0.18rem;
      box-sizing: border-box;
      opacity: .85;
      position: relative;
    }
    thead th:nth-child(4n + 2) .column-type-icon {
      border-color: var(--vscode-charts-blue);
    }
    thead th:nth-child(4n + 3) .column-type-icon {
      border-color: var(--vscode-charts-purple);
    }
    thead th:nth-child(4n + 4) .column-type-icon {
      border-color: var(--vscode-charts-green);
    }
    thead th:nth-child(4n + 5) .column-type-icon {
      border-color: var(--vscode-charts-orange);
    }
    .column-type-icon::before {
      content: "";
      position: absolute;
      left: -0.28rem;
      top: 0.25rem;
      width: 0.35rem;
      height: 0.35rem;
      border: 2px solid var(--vscode-descriptionForeground);
      border-radius: 50%;
      background: var(--vscode-editorWidget-background);
    }
    thead th:nth-child(4n + 2) .column-type-icon::before {
      border-color: var(--vscode-charts-blue);
    }
    thead th:nth-child(4n + 3) .column-type-icon::before {
      border-color: var(--vscode-charts-purple);
    }
    thead th:nth-child(4n + 4) .column-type-icon::before {
      border-color: var(--vscode-charts-green);
    }
    thead th:nth-child(4n + 5) .column-type-icon::before {
      border-color: var(--vscode-charts-orange);
    }
    .sort-mark {
      margin-left: auto;
      padding-left: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }
    .sort-button,
    .filter-button {
      width: var(--toolbar-button-size);
      height: var(--toolbar-button-size);
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      padding: 0;
      color: var(--vscode-icon-foreground, var(--text-main));
      border: 0;
      opacity: .92;
    }
    .sort-button.active,
    .filter-button.active {
      color: var(--accent);
      background: color-mix(in srgb, var(--bg-active) 32%, transparent);
      opacity: 1;
    }
    .filter-icon {
      width: calc(var(--icon-size) * 1.05);
      height: calc(var(--icon-size) * 1.05);
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .resize-handle {
      position: absolute;
      top: 0;
      right: -0.28rem;
      bottom: 0;
      z-index: 4;
      width: 0.55rem;
      cursor: col-resize;
    }
    .resize-handle:hover,
    .resize-handle.resizing {
      background: var(--accent);
    }
    .resize-handle::after {
      content: "\u2194";
      position: absolute;
      top: 50%;
      right: -0.65rem;
      z-index: 5;
      width: 1.2rem;
      height: 1.2rem;
      display: none;
      place-items: center;
      transform: translateY(-50%);
      color: var(--vscode-button-foreground);
      background: var(--accent);
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      line-height: 1;
      pointer-events: none;
    }
    .resize-handle:hover::after,
    .resize-handle.resizing::after {
      display: grid;
    }
    th:first-child {
      position: sticky;
      left: 0;
      z-index: 3;
      min-width: clamp(2.65rem, 2.35rem + 0.6vw, 3.5rem);
      width: clamp(2.65rem, 2.35rem + 0.6vw, 3.5rem);
      color: var(--text-muted);
      text-align: right;
      background: var(--bg-header);
    }
    tbody tr:nth-child(even) {
      background: color-mix(in srgb, var(--vscode-editor-background) 94%, var(--vscode-editor-foreground));
    }
    tbody tr.selected-row td,
    tbody tr.selected-row th {
      background: var(--bg-selected);
    }
    th.selected-column,
    td.selected-column {
      background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground) 55%, transparent);
    }
    td.selected-cell {
      background: var(--bg-active);
      color: var(--vscode-list-activeSelectionForeground);
      outline: 1px solid var(--accent);
      outline-offset: -1px;
    }
    td.null {
      color: var(--text-muted);
      font-style: italic;
    }
    .pager {
      position: absolute;
      left: 50%;
      bottom: var(--space-sm);
      z-index: 5;
      transform: translateX(-50%);
      font-size: .86em;
    }
    .pager-group {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      height: clamp(1.9rem, 1.65rem + 0.45vw, 2.35rem);
      padding: 0 var(--space-sm);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-header);
      box-shadow: 0 6px 18px rgba(0, 0, 0, .28);
    }
    .page-size {
      min-width: 86px;
      border: 0;
      background: transparent;
    }
    .pager-button {
      width: var(--toolbar-button-size);
      height: var(--toolbar-button-size);
      padding: 0;
      color: var(--text-muted);
      font-size: var(--icon-size);
    }
    .pager-button:disabled {
      opacity: .38;
    }
    .pager-separator {
      width: 1px;
      height: 24px;
      background: var(--vscode-panel-border);
    }
    #fetchInfo {
      display: none;
    }
    .filter-popover {
      position: fixed;
      z-index: 30;
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      width: min(28rem, 82vw);
      max-height: min(34rem, 72vh);
      padding: var(--space-md);
      border: 1px solid var(--accent);
      background: var(--vscode-dropdown-background);
      border-radius: var(--radius-sm);
      box-shadow: 0 10px 26px rgba(0, 0, 0, .34);
      overflow: hidden;
      box-sizing: border-box;
    }
    .filter-popover[hidden] {
      display: none;
    }
    .filter-title {
      color: var(--text-main);
      font-size: 1.05rem;
      font-weight: 600;
    }
    .filter-search {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      min-height: calc(var(--toolbar-button-size) * 1.25);
      padding: 0 var(--space-sm);
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      background: var(--vscode-input-background);
    }
    .filter-search span {
      color: var(--text-muted);
      font-size: 1.15rem;
    }
    .filter-search input {
      width: 100%;
      min-width: 0;
      height: var(--toolbar-button-size);
      padding: 0;
      color: var(--vscode-input-foreground);
      background: transparent;
      border: 0;
      outline: 0;
      font: inherit;
    }
    .filter-option-list {
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }
    .filter-option {
      min-height: calc(var(--row-height) * 1.25);
      display: grid;
      grid-template-columns: 1.45rem minmax(0, 1fr) 5rem;
      align-items: center;
      gap: var(--space-sm);
      color: var(--text-main);
    }
    .filter-option input {
      width: 1rem;
      height: 1rem;
    }
    .filter-option span:not(.filter-count) {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .filter-option-heading {
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      font-weight: 600;
    }
    .filter-count {
      color: var(--text-muted);
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .filter-live-status {
      color: var(--text-muted);
      text-align: right;
      font-weight: 600;
    }
    .selection-summary {
      position: absolute;
      right: var(--space-sm);
      bottom: var(--space-sm);
      z-index: 6;
      max-width: min(48rem, calc(50vw - 2rem));
      min-height: clamp(2.15rem, 1.9rem + 0.45vw, 2.65rem);
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm);
      padding: 0 var(--space-sm);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-header);
      color: var(--text-muted);
      box-shadow: 0 6px 18px rgba(0, 0, 0, .24);
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 0.98rem;
    }
    .selection-summary[hidden] {
      display: none;
    }
    .selection-summary span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .summary-column {
      color: var(--text-main);
      font-weight: 600;
    }
    .loading-overlay {
      position: absolute;
      inset: 0;
      z-index: 4;
      display: grid;
      place-items: center;
      pointer-events: none;
      background: color-mix(in srgb, var(--bg-main) 70%, transparent);
    }
    .loading-overlay[hidden] {
      display: none;
    }
    .loading-panel {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm);
      min-height: var(--toolbar-button-size);
      padding: 0 var(--space-md);
      color: var(--text-main);
      background: var(--bg-header);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      box-shadow: 0 6px 18px rgba(0, 0, 0, .24);
    }
    .loading-spinner {
      width: 1rem;
      height: 1rem;
      border: 2px solid color-mix(in srgb, var(--vscode-charts-yellow) 35%, transparent);
      border-top-color: var(--vscode-charts-yellow);
      border-radius: 50%;
      animation: spin 0.85s linear infinite;
    }
    .loading-spinner[hidden] {
      display: none;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .muted {
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <button class="icon-button" id="refresh" data-tone="blue" title="Refresh data">\u21BB</button>
      <button class="icon-button" id="copyRows" data-tone="purple" title="Copy visible rows as TSV">\u29C9</button>
      <button class="icon-button" id="focusWhere" data-tone="blue" title="Focus WHERE">\u2315</button>
      <span class="toolbar-separator"></span>
      <button class="icon-button" id="generateSelect" data-tone="green" title="Generate SELECT">\uFF0B</button>
      <button class="icon-button" id="clearCriteria" data-tone="red" title="Clear WHERE, ORDER BY, and column filters">\u2212</button>
      <button class="icon-button" id="resetRows" data-tone="orange" title="Reset to 500 rows">\u21B6</button>
      <button id="showDdl" title="Show DDL">DDL</button>
      <button class="icon-button" id="applyWhere" data-tone="green" title="Apply WHERE">\u25B6</button>
      <button class="icon-button" id="toggleFilters" data-tone="blue" title="Show or hide per-column filters"><svg class="filter-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 3.5h11l-4.4 5v3.6l-2.2 1.1V8.5l-4.4-5Z"></path></svg></button>
      <button class="icon-button" id="clearFilters" data-tone="orange" title="Clear column filters">\u25C7</button>
      <span class="toolbar-spacer"></span>
      <select id="exportFormat" class="tool-select" title="Export visible rows">
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
        <option value="tsv">TSV</option>
      </select>
      <button class="icon-button" id="export" data-tone="green" title="Export">\u21E9</button>
    </div>
    <div class="criteria-row">
      <div class="criteria">
        <span class="criteria-icon"><svg class="filter-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 3.5h11l-4.4 5v3.6l-2.2 1.1V8.5l-4.4-5Z"></path></svg></span>
        <strong>WHERE</strong>
        <input id="where" aria-label="Filter rows">
      </div>
      <div class="criteria">
        <span class="criteria-icon">\u2261</span>
        <strong>ORDER BY</strong>
        <input id="orderBy" aria-label="Order rows">
      </div>
    </div>
    <div id="columnSuggest" class="column-suggest" hidden></div>
    <div id="gridWrap" class="grid-wrap">
      <div class="grid">
        <table id="table">
          <colgroup id="colgroup"></colgroup>
          <thead id="thead"></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
      <div class="pager">
        <span class="pager-group">
          <button id="firstPage" class="pager-button" title="First page">|\u2039</button>
          <button id="prevPage" class="pager-button" title="Previous page">\u2039</button>
          <select id="pageSize" class="page-size" title="Rows requested from the database">
            <option value="500">1-500</option>
            <option value="1000">1-1,000</option>
            <option value="5000">1-5,000</option>
            <option value="0">All</option>
          </select>
          <span id="rowCount">of 0</span>
          <button id="nextPage" class="pager-button" title="Next page">\u203A</button>
          <span id="fetchInfo" class="muted"></span>
        </span>
      </div>
      <div id="selectionSummary" class="selection-summary" hidden></div>
      <div id="filterPopover" class="filter-popover" hidden></div>
      <div id="loadingOverlay" class="loading-overlay" aria-live="polite">
        <span class="loading-panel">
          <span id="loadingSpinner" class="loading-spinner" aria-hidden="true"></span>
          <span id="loadingText">Loading table data...</span>
        </span>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const DEFAULT_COLUMN_WIDTH = 220;
    const MIN_COLUMN_WIDTH = 112;
    const MAX_FILTER_OPTIONS = 250;
    let rows = ${JSON.stringify(rows).replace(/</g, "\\u003c")};
    let columns = ${JSON.stringify(columns)};
    let columnTypes = {};
    let columnWidths = {};
    let durationMs = ${JSON.stringify(durationMs)};
    let currentLimit = ${JSON.stringify(maxRows)};
    let currentOffset = 0;
    let hasMore = ${JSON.stringify(hasMore)};
    let sort = null;
    let loading = ${JSON.stringify(initialLoading)};
    let errorMessage = '';
    let selectedCell = null;
    let selectedRow = null;
    let selectedColumn = null;
    let columnFiltersVisible = true;
    const columnFilters = new Map();
    let activeFilterColumn = null;
    let filterDraft = new Set();
    let filterSearch = '';
    let suggestInput = null;
    let suggestContext = null;
    let suggestItems = [];
    let suggestIndex = 0;
    const NUMERIC_TYPE_IDS = new Set([20, 21, 23, 700, 701, 790, 1700]);
    const NUMERIC_TYPE_NAMES = [
      'bigint',
      'bigserial',
      'decimal',
      'double precision',
      'float',
      'float4',
      'float8',
      'int',
      'int2',
      'int4',
      'int8',
      'integer',
      'money',
      'numeric',
      'real',
      'serial',
      'serial2',
      'serial4',
      'serial8',
      'smallint'
    ];
    const where = document.getElementById('where');
    const tbody = document.getElementById('tbody');
    const thead = document.getElementById('thead');
    const colgroup = document.getElementById('colgroup');
    const rowCount = document.getElementById('rowCount');
    const fetchInfo = document.getElementById('fetchInfo');
    const orderBy = document.getElementById('orderBy');
    const columnSuggest = document.getElementById('columnSuggest');
    const pageSize = document.getElementById('pageSize');
    const toggleFilters = document.getElementById('toggleFilters');
    const firstPage = document.getElementById('firstPage');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const gridWrap = document.getElementById('gridWrap');
    const filterPopover = document.getElementById('filterPopover');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const loadingText = document.getElementById('loadingText');
    const selectionSummary = document.getElementById('selectionSummary');
    pageSize.value = String(currentLimit || 0);

    function cell(value) {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }
    function html(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }
    function csvValue(value) {
      return '"' + cell(value).replaceAll('"', '""') + '"';
    }
    function filterKey(value) {
      if (value === null || value === undefined) return '<NULL>';
      return cell(value);
    }
    function filterLabel(value) {
      if (value === null || value === undefined) return 'NULL';
      const next = cell(value);
      return next === '' ? '(empty)' : next;
    }
    function sqlIdentifier(column) {
      return /^[A-Za-z_][A-Za-z0-9_]*$/.test(column)
        ? column
        : '"' + column.replaceAll('"', '""') + '"';
    }
    function suggestColumnContext(input) {
      const cursor = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, cursor);
      const match = before.match(/[A-Za-z_][A-Za-z0-9_]*$/);
      const partial = match ? match[0] : '';
      return {
        start: cursor - partial.length,
        end: cursor,
        partial
      };
    }
    function matchingColumns(partial) {
      const lower = partial.toLowerCase();
      return columns
        .filter((column) => !lower || column.toLowerCase().startsWith(lower))
        .slice(0, 30);
    }
    function positionColumnSuggest(input) {
      const rect = input.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 16);
      columnSuggest.style.width = width + 'px';
      columnSuggest.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
      columnSuggest.style.top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 80)) + 'px';
    }
    function renderColumnSuggest(input) {
      if (!columns.length) {
        closeColumnSuggest();
        return;
      }
      suggestInput = input;
      suggestContext = suggestColumnContext(input);
      suggestItems = matchingColumns(suggestContext.partial);
      suggestIndex = Math.min(suggestIndex, Math.max(0, suggestItems.length - 1));
      if (!suggestItems.length) {
        closeColumnSuggest();
        return;
      }
      positionColumnSuggest(input);
      columnSuggest.hidden = false;
      columnSuggest.innerHTML = suggestItems.map((column, index) => {
        const type = columnTypes[column]?.dataTypeName || '';
        return '<button type="button" class="' + (index === suggestIndex ? 'active' : '') + '" data-suggest-index="' + index + '"><span class="column-suggest-name">' + html(column) + '</span><span class="column-suggest-type">' + html(type) + '</span></button>';
      }).join('');
      columnSuggest.querySelectorAll('[data-suggest-index]').forEach((button) => {
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          applyColumnSuggest(Number(button.getAttribute('data-suggest-index')));
        });
      });
    }
    function closeColumnSuggest() {
      suggestInput = null;
      suggestContext = null;
      suggestItems = [];
      suggestIndex = 0;
      columnSuggest.hidden = true;
      columnSuggest.innerHTML = '';
    }
    function applyColumnSuggest(index = suggestIndex) {
      if (!suggestInput || !suggestContext || !suggestItems[index]) return;
      const column = sqlIdentifier(suggestItems[index]);
      const before = suggestInput.value.slice(0, suggestContext.start);
      const after = suggestInput.value.slice(suggestContext.end);
      suggestInput.value = before + column + after;
      const nextCursor = before.length + column.length;
      suggestInput.focus();
      suggestInput.setSelectionRange(nextCursor, nextCursor);
      closeColumnSuggest();
    }
    function moveColumnSuggest(delta) {
      if (columnSuggest.hidden || !suggestItems.length) return;
      suggestIndex = (suggestIndex + delta + suggestItems.length) % suggestItems.length;
      renderColumnSuggest(suggestInput);
    }
    function handleCriteriaSuggestKeydown(event, input, onSubmit, onClear) {
      if (!columnSuggest.hidden && suggestInput === input) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveColumnSuggest(1);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveColumnSuggest(-1);
          return;
        }
        if (event.key === 'Tab' || event.key === 'Enter') {
          event.preventDefault();
          applyColumnSuggest();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          closeColumnSuggest();
          return;
        }
      }
      if (event.key === 'Enter') {
        onSubmit();
      }
      if (event.key === 'Escape') {
        onClear();
      }
    }
    function columnFilterOptions(column) {
      const counts = new Map();
      rows.forEach((row) => {
        const key = filterKey(row[column]);
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { key, label: filterLabel(row[column]), count: 1 });
        }
      });
      return [...counts.values()].sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));
    }
    function filteredRows() {
      let nextRows = rows.filter((row) => {
        return columns.every((column) => {
          const selected = columnFilters.get(column);
          return !selected || selected.has(filterKey(row[column]));
        });
      });
      return nextRows;
    }
    function exportRows(format) {
      const visibleRows = filteredRows();
      if (format === 'json') {
        return JSON.stringify(visibleRows, null, 2);
      }
      const separator = format === 'tsv' ? '\\t' : ',';
      const encode = format === 'tsv' ? cell : csvValue;
      return [columns.join(separator), ...visibleRows.map((row) => columns.map((column) => encode(row[column])).join(separator))].join('\\n');
    }
    function pageSizeValue() {
      return Number(pageSize.value) || 0;
    }
    function pageEnd() {
      return currentOffset + filteredRows().length;
    }
    function isIdentifierColumn(column) {
      return column.toLowerCase() === 'id'
        || /^id[_\\-\\s]/i.test(column)
        || /[_\\-\\s]id$/i.test(column)
        || /Id$/.test(column)
        || /ID$/.test(column);
    }
    function isNumericAggregateColumn(column) {
      if (isIdentifierColumn(column)) return false;
      const field = columnTypes[column] || {};
      if (typeof field.dataTypeId === 'number' && NUMERIC_TYPE_IDS.has(field.dataTypeId)) return true;
      const typeName = typeof field.dataTypeName === 'string' ? field.dataTypeName.toLowerCase().replace(/\\s+/g, ' ').trim() : '';
      return !!typeName && NUMERIC_TYPE_NAMES.some((numericType) => typeName === numericType || typeName.startsWith(numericType + '(') || typeName.startsWith(numericType + ' '));
    }
    function numericValue(value) {
      if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
      if (typeof value === 'bigint') {
        const next = Number(value);
        return Number.isFinite(next) ? next : undefined;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed || !/^-?(?:\\d+|\\d*\\.\\d+)(?:e[+-]?\\d+)?$/i.test(trimmed)) return undefined;
        const next = Number(trimmed);
        return Number.isFinite(next) ? next : undefined;
      }
      return undefined;
    }
    function formatNumber(value) {
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
    }
    function selectedColumnStats() {
      if (!selectedColumn || !isNumericAggregateColumn(selectedColumn)) return null;
      const values = filteredRows()
        .map((row) => numericValue(row[selectedColumn]))
        .filter((value) => value !== undefined);
      if (!values.length) return null;
      const sum = values.reduce((total, value) => total + value, 0);
      return {
        sum,
        average: sum / values.length,
        count: values.length
      };
    }
    function updateSelectionSummary() {
      if (!selectedColumn) {
        selectionSummary.hidden = true;
        selectionSummary.innerHTML = '';
        return;
      }
      const stats = selectedColumnStats();
      selectionSummary.hidden = false;
      selectionSummary.title = stats
        ? selectedColumn + ': sum ' + formatNumber(stats.sum) + ', average ' + formatNumber(stats.average)
        : selectedColumn + ': ' + filteredRows().length.toLocaleString() + ' rows selected';
      selectionSummary.innerHTML = '<span class="summary-column">' + html(selectedColumn) + '</span>' + (
        stats
          ? '<span>' + stats.count.toLocaleString() + ' values</span><span>Sum ' + html(formatNumber(stats.sum)) + '</span><span>Avg ' + html(formatNumber(stats.average)) + '</span>'
          : '<span>' + filteredRows().length.toLocaleString() + ' rows selected</span>'
      );
    }
    function positionFilterPopover(anchor) {
      const rect = anchor.getBoundingClientRect();
      const viewportPadding = 8;
      const width = Math.min(448, Math.max(260, window.innerWidth - viewportPadding * 2));
      const below = window.innerHeight - rect.bottom - viewportPadding;
      const above = rect.top - viewportPadding;
      const openBelow = below >= 240 || below >= above;
      const availableHeight = Math.max(96, openBelow ? below - 4 : above - 4);
      const maxHeight = Math.min(544, availableHeight);
      const top = openBelow
        ? rect.bottom + 4
        : Math.max(viewportPadding, rect.top - maxHeight - 4);
      filterPopover.style.width = width + 'px';
      filterPopover.style.maxHeight = maxHeight + 'px';
      filterPopover.style.left = Math.max(viewportPadding, Math.min(rect.right - width, window.innerWidth - width - viewportPadding)) + 'px';
      filterPopover.style.top = top + 'px';
    }
    function openColumnFilter(column, anchor) {
      activeFilterColumn = column;
      filterSearch = '';
      const allKeys = columnFilterOptions(column).map((option) => option.key);
      filterDraft = new Set(columnFilters.get(column) || allKeys);
      positionFilterPopover(anchor);
      renderFilterPopover();
    }
    function closeColumnFilter() {
      activeFilterColumn = null;
      filterPopover.hidden = true;
      filterPopover.innerHTML = '';
    }
    function commitFilterDraft() {
      if (!activeFilterColumn) return;
      const allKeys = columnFilterOptions(activeFilterColumn).map((option) => option.key);
      if (filterDraft.size === allKeys.length) {
        columnFilters.delete(activeFilterColumn);
      } else {
        columnFilters.set(activeFilterColumn, new Set(filterDraft));
      }
      renderHeader();
      renderBody();
    }
    function renderFilterPopover(restoreSearchFocus = false) {
      if (!activeFilterColumn) {
        closeColumnFilter();
        return;
      }
      const options = columnFilterOptions(activeFilterColumn);
      const allKeys = options.map((option) => option.key);
      const visibleOptions = options
        .filter((option) => option.label.toLowerCase().includes(filterSearch.trim().toLowerCase()))
        .slice(0, MAX_FILTER_OPTIONS);
      const visibleKeys = visibleOptions.map((option) => option.key);
      const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => filterDraft.has(key));
      filterPopover.hidden = false;
      filterPopover.innerHTML =
        '<div class="filter-title">Local Filter For \\'' + html(activeFilterColumn) + '\\'</div>' +
        '<label class="filter-search"><span>\u2315</span><input id="filterSearchInput" value="' + html(filterSearch) + '"></label>' +
        '<label class="filter-option filter-option-heading"><input id="filterSelectVisible" type="checkbox" ' + (allVisibleSelected ? 'checked' : '') + '><span>Value</span><span class="filter-count">Count</span></label>' +
        '<div class="filter-option-list">' + visibleOptions.map((option) => {
          return '<label class="filter-option"><input type="checkbox" data-filter-value="' + html(option.key) + '" ' + (filterDraft.has(option.key) ? 'checked' : '') + '><span title="' + html(option.label) + '">' + html(option.label) + '</span><span class="filter-count">' + option.count.toLocaleString() + '</span></label>';
        }).join('') + '</div>' +
        '<div class="filter-live-status">' + filterDraft.size.toLocaleString() + ' selected</div>';

      const searchInput = document.getElementById('filterSearchInput');
      searchInput.addEventListener('input', () => {
        filterSearch = searchInput.value;
        renderFilterPopover(true);
      });
      if (restoreSearchFocus) {
        const nextSearchInput = document.getElementById('filterSearchInput');
        nextSearchInput.focus();
        nextSearchInput.setSelectionRange(nextSearchInput.value.length, nextSearchInput.value.length);
      }
      document.getElementById('filterSelectVisible').addEventListener('change', () => {
        if (allVisibleSelected) {
          visibleKeys.forEach((key) => filterDraft.delete(key));
        } else {
          visibleKeys.forEach((key) => filterDraft.add(key));
        }
        commitFilterDraft();
        renderFilterPopover();
      });
      filterPopover.querySelectorAll('[data-filter-value]').forEach((input) => {
        input.addEventListener('change', () => {
          const key = input.getAttribute('data-filter-value');
          if (input.checked) {
            filterDraft.add(key);
          } else {
            filterDraft.delete(key);
          }
          commitFilterDraft();
          renderFilterPopover();
        });
      });
    }
    function updatePager() {
      const visibleCount = filteredRows().length;
      const start = visibleCount ? currentOffset + 1 : currentOffset;
      const end = currentOffset + visibleCount;
      const totalHint = hasMore ? end + 1 + '+' : String(end);
      rowCount.textContent = loading ? 'Loading...' : 'of ' + totalHint;
      const label = currentLimit ? start.toLocaleString() + '-' + end.toLocaleString() : 'All';
      const option = pageSize.querySelector('option[value="' + String(currentLimit || 0) + '"]');
      if (option) {
        option.textContent = label;
      }
      firstPage.disabled = loading || currentOffset === 0;
      prevPage.disabled = loading || currentOffset === 0 || !currentLimit;
      nextPage.disabled = loading || !hasMore || !currentLimit;
    }
    function updateLoadingOverlay() {
      const visible = loading || errorMessage;
      loadingOverlay.hidden = !visible;
      loadingSpinner.hidden = !loading;
      loadingText.textContent = loading ? 'Loading table data...' : errorMessage;
    }
    const filterIconMarkup = '<svg class="filter-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 3.5h11l-4.4 5v3.6l-2.2 1.1V8.5l-4.4-5Z"></path></svg>';
    function renderHeader() {
      colgroup.innerHTML = '<col class="rownum-col">' + columns.map((column) => '<col class="data-col" style="width: ' + (columnWidths[column] || DEFAULT_COLUMN_WIDTH) + 'px">').join('');
      thead.innerHTML = '<tr><th>#</th>' + columns.map((column) => {
        const mark = sort?.column === column ? (sort.direction === 'asc' ? '\u25B2' : '\u25BC') : '\u2195';
        const filterButton = columnFiltersVisible ? '<button class="filter-button ' + (columnFilters.has(column) ? 'active' : '') + '" data-filter-button="' + html(column) + '" title="Filter ' + html(column) + '">' + filterIconMarkup + '</button>' : '';
        return '<th class="' + (selectedColumn === column ? 'selected-column' : '') + '"><div class="header-cell-actions"><button class="header-button" data-select-column="' + html(column) + '" title="Select column ' + html(column) + '"><span class="column-type-icon"></span><span>' + html(column) + '</span></button><button class="sort-button ' + (sort?.column === column ? 'active' : '') + '" data-sort="' + html(column) + '" title="Order by ' + html(column) + '">' + mark + '</button>' + filterButton + '</div><span class="resize-handle" data-resize-column="' + html(column) + '" title="Resize column"></span></th>';
      }).join('') + '</tr>';
      toggleFilters.classList.toggle('active', columnFiltersVisible);
      document.querySelectorAll('[data-select-column]').forEach((button) => {
        button.addEventListener('click', () => {
          selectedColumn = button.getAttribute('data-select-column');
          selectedCell = null;
          selectedRow = null;
          render();
        });
      });
      document.querySelectorAll('[data-sort]').forEach((button) => {
        button.addEventListener('click', () => {
          const column = button.getAttribute('data-sort');
          selectedColumn = column;
          selectedCell = null;
          selectedRow = null;
          sort = sort?.column === column && sort.direction === 'asc' ? { column, direction: 'desc' } : { column, direction: 'asc' };
          orderBy.value = sort.column + ' ' + sort.direction;
          fetchRows();
        });
      });
      document.querySelectorAll('[data-filter-button]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const column = button.getAttribute('data-filter-button');
          if (activeFilterColumn === column) {
            closeColumnFilter();
          } else {
            openColumnFilter(column, button);
          }
        });
      });
      document.querySelectorAll('[data-resize-column]').forEach((handle) => {
        handle.addEventListener('mousedown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const column = handle.getAttribute('data-resize-column');
          const startX = event.clientX;
          const startWidth = columnWidths[column] || DEFAULT_COLUMN_WIDTH;
          handle.classList.add('resizing');
          const onMove = (moveEvent) => {
            columnWidths[column] = Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX);
            renderHeader();
          };
          const onUp = () => {
            handle.classList.remove('resizing');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      });
    }
    function renderBody() {
      const nextRows = filteredRows();
      tbody.innerHTML = nextRows.map((row, index) => '<tr class="' + (selectedRow === index ? 'selected-row' : '') + '"><th data-row="' + index + '">' + (currentOffset + index + 1) + '</th>' + columns.map((column) => {
        const value = row[column];
        const text = html(cell(value));
        const classes = [
          value === null ? 'null' : '',
          selectedColumn === column ? 'selected-column' : '',
          selectedCell?.row === index && selectedCell?.column === column ? 'selected-cell' : ''
        ].filter(Boolean).join(' ');
        return '<td class="' + classes + '" data-row="' + index + '" data-column="' + html(column) + '" title="' + text + '">' + (value === null ? 'NULL' : text) + '</td>';
      }).join('') + '</tr>').join('');
      fetchInfo.textContent = loading ? 'Loading...' : durationMs + 'ms';
      updatePager();
      updateLoadingOverlay();
      updateSelectionSummary();
    }
    function render() {
      renderHeader();
      renderBody();
    }
    function fetchRows(nextOffset = currentOffset) {
      currentOffset = Math.max(0, nextOffset);
      loading = true;
      errorMessage = '';
      renderBody();
      vscode.postMessage({
        type: 'fetch',
        limit: pageSizeValue(),
        offset: currentOffset,
        where: where.value.trim(),
        orderBySql: orderBy.value.trim(),
        orderBy: orderBy.value.trim() ? [] : sort ? [sort] : []
      });
    }
    where.addEventListener('keydown', (event) => {
      handleCriteriaSuggestKeydown(event, where, () => fetchRows(0), () => {
        where.value = '';
        fetchRows(0);
      });
    });
    where.addEventListener('input', () => renderColumnSuggest(where));
    where.addEventListener('focus', () => renderColumnSuggest(where));
    orderBy.addEventListener('keydown', (event) => {
      handleCriteriaSuggestKeydown(event, orderBy, () => {
        sort = null;
        selectedColumn = null;
        fetchRows(0);
      }, () => {
        orderBy.value = '';
        sort = null;
        selectedColumn = null;
        fetchRows(0);
      });
    });
    orderBy.addEventListener('input', () => renderColumnSuggest(orderBy));
    orderBy.addEventListener('focus', () => renderColumnSuggest(orderBy));
    toggleFilters.addEventListener('click', () => {
      columnFiltersVisible = !columnFiltersVisible;
      if (!columnFiltersVisible) {
        closeColumnFilter();
      }
      render();
    });
    filterPopover.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    document.addEventListener('click', (event) => {
      if (activeFilterColumn && !filterPopover.contains(event.target) && !event.target.closest('[data-filter-button]')) {
        closeColumnFilter();
      }
      if (!columnSuggest.contains(event.target) && event.target !== where && event.target !== orderBy) {
        closeColumnSuggest();
      }
    });
    document.getElementById('export').addEventListener('click', () => {
      const format = document.getElementById('exportFormat').value;
      vscode.postMessage({ type: 'export', format, text: exportRows(format) });
    });
    document.getElementById('copyRows').addEventListener('click', () => {
      vscode.postMessage({ type: 'copy', text: exportRows('tsv') });
    });
    document.getElementById('focusWhere').addEventListener('click', () => {
      where.focus();
    });
    document.getElementById('applyWhere').addEventListener('click', () => fetchRows(0));
    document.getElementById('showDdl').addEventListener('click', () => {
      vscode.postMessage({ type: 'command', command: 'ddl' });
    });
    document.getElementById('generateSelect').addEventListener('click', () => {
      vscode.postMessage({ type: 'command', command: 'select' });
    });
    document.getElementById('clearCriteria').addEventListener('click', () => {
      where.value = '';
      orderBy.value = '';
      sort = null;
      selectedColumn = null;
      columnFilters.clear();
      closeColumnFilter();
      fetchRows(0);
    });
    document.getElementById('clearFilters').addEventListener('click', () => {
      columnFilters.clear();
      closeColumnFilter();
      render();
    });
    document.getElementById('resetRows').addEventListener('click', () => {
      pageSize.value = '500';
      where.value = '';
      orderBy.value = '';
      sort = null;
      selectedColumn = null;
      columnFilters.clear();
      closeColumnFilter();
      fetchRows(0);
    });
    pageSize.addEventListener('change', () => {
      fetchRows(0);
    });
    document.getElementById('refresh').addEventListener('click', () => {
      fetchRows();
    });
    firstPage.addEventListener('click', () => fetchRows(0));
    prevPage.addEventListener('click', () => fetchRows(Math.max(0, currentOffset - pageSizeValue())));
    nextPage.addEventListener('click', () => fetchRows(currentOffset + pageSizeValue()));
    tbody.addEventListener('click', (event) => {
      const target = event.target;
      const cellElement = target.closest('td');
      const rowHeader = target.closest('th[data-row]');
      if (cellElement) {
        selectedCell = { row: Number(cellElement.dataset.row), column: cellElement.dataset.column };
        selectedRow = null;
        selectedColumn = null;
        render();
      } else if (rowHeader) {
        selectedRow = Number(rowHeader.dataset.row);
        selectedCell = null;
        selectedColumn = null;
        render();
      }
    });
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'error') {
        loading = false;
        errorMessage = event.data.message || 'Query failed';
        renderBody();
        return;
      }
      if (event.data?.type !== 'state') return;
      rows = event.data.rows || [];
      columns = event.data.columns || [];
      columnTypes = event.data.columnTypes || {};
      durationMs = event.data.durationMs || 0;
      currentLimit = event.data.limit || 0;
      currentOffset = event.data.offset || 0;
      hasMore = !!event.data.hasMore;
      pageSize.value = String(currentLimit);
      loading = false;
      errorMessage = '';
      selectedCell = null;
      selectedRow = null;
      if (selectedColumn && !columns.includes(selectedColumn)) {
        selectedColumn = null;
      }
      columnFilters.clear();
      closeColumnFilter();
      render();
    });
    render();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
};
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// src/utils/logger.ts
var vscode22 = __toESM(require("vscode"));
var Logger = class {
  output = vscode22.window.createOutputChannel("Database");
  info(message) {
    this.output.appendLine(`[info] ${message}`);
  }
  error(message, error) {
    this.output.appendLine(`[error] ${message}`);
    if (error instanceof Error) {
      this.output.appendLine(error.stack ?? error.message);
    } else if (error !== void 0) {
      this.output.appendLine(String(error));
    }
  }
  show() {
    this.output.show();
  }
};

// src/extension.ts
var PROJECT_SQL_SESSION_PREFIX2 = "project-sql:";
function activate(context) {
  const logger = new Logger();
  const connectionStore = new ConnectionStore(context);
  const connectionManager = new ConnectionManager(connectionStore);
  const historyStore = new QueryHistoryStore(context);
  const consoleStore = new QueryConsoleStore(context);
  const sqlDocumentConnections = new SqlDocumentConnectionStore(context);
  const resultStore = new ResultSessionStore(context);
  const schemaContext = new SchemaContextService(connectionManager, new SchemaMetadataCacheStore(context));
  const sectionService = new SqlSectionService();
  const highlighter = new SqlSectionHighlighter();
  const sqlDiagnostics = vscode23.languages.createDiagnosticCollection("database-sql");
  const diagnosticsService = new SqlDiagnosticsService(connectionManager, schemaContext, sectionService);
  const aiAdapter = new VsCodeLanguageModelSqlAdapter();
  void vscode23.commands.executeCommand("setContext", "database.aiAvailable", false);
  void aiAdapter.isAvailable().then((available) => {
    void vscode23.commands.executeCommand("setContext", "database.aiAvailable", available);
  });
  const memoryStore = new QueryMemoryStore(context);
  const memoryService = new QueryMemoryService(historyStore, memoryStore, consoleStore, connectionManager, aiAdapter);
  const executor = new QueryExecutor(connectionManager, historyStore, memoryService);
  const queryOutput = new QueryOutputService();
  const diagnosticTimers = /* @__PURE__ */ new Map();
  const diagnosticVersions = /* @__PURE__ */ new Map();
  const runningDocuments = /* @__PURE__ */ new Map();
  const statementRunningDecoration = vscode23.window.createTextEditorDecorationType({
    before: {
      contentIconPath: vscode23.Uri.joinPath(context.extensionUri, "media", "sql-running.svg"),
      width: "12px",
      height: "12px",
      margin: "0 6px 0 0"
    }
  });
  const statementCompletedDecoration = vscode23.window.createTextEditorDecorationType({
    before: { contentText: "\u2713 ", color: new vscode23.ThemeColor("testing.iconPassed") }
  });
  const statementFailedDecoration = vscode23.window.createTextEditorDecorationType({
    before: { contentText: "\u2717 ", color: new vscode23.ThemeColor("testing.iconFailed") }
  });
  let pruningMissingConsoles = false;
  let pruningUnknownConnections = false;
  let queryMap;
  const results = new ResultsPanelProvider(
    context,
    resultStore,
    executor,
    async (tab) => revealSourceForTab(tab),
    (tabs) => queryMap?.updateResults(tabs),
    async (maxRows) => executeActiveMultiStatementSelection(maxRows)
  );
  queryMap = new QueryMapProvider(
    sectionService,
    async (documentUri, section) => {
      await highlighter.reveal(documentUri, rangeToPlain(section.range), section.sql);
    },
    async (documentUri, section) => {
      const editor = vscode23.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "sql" || editor.document.uri.toString() !== documentUri) {
        return;
      }
      await executeDetected(editor, section);
    },
    () => queryConsoleHistoryItems(),
    async (item) => openHistoryItem(item),
    async (id, pinned) => {
      if (documentUriFromProjectSqlSessionId(id)) {
        return;
      }
      await consoleStore.setPinned(id, pinned);
      refreshQueryMap();
    },
    async (id) => {
      await untrackActiveSession(id);
      refreshQueryMap();
    },
    async (id, direction) => {
      if (documentUriFromProjectSqlSessionId(id)) {
        return;
      }
      await consoleStore.move(id, direction);
      refreshQueryMap();
    },
    async (documentUri) => {
      if (queryConsoleDocumentUris(consoleStore.getAll()).has(documentUri)) {
        await consoleStore.touchDocument(documentUri, { opened: true });
      } else {
        await sqlDocumentConnections.touch(documentUri);
      }
      await results.show(connectionIdForDocumentUri(documentUri));
      refreshQueryMap();
    },
    async (item) => {
      await historyStore.update(item);
      refreshQueryMap();
    },
    async (id) => {
      await historyStore.delete(id);
      refreshQueryMap();
    },
    async (ids) => {
      await clearActiveSessionsById(ids);
      refreshQueryMap();
    },
    async (ids) => {
      const idSet = new Set(ids);
      const memoryIds = memoryStore.getAll().filter((item) => item.historyIds?.some((id) => idSet.has(id)) || item.latestHistoryId !== void 0 && idSet.has(item.latestHistoryId)).map((item) => item.id);
      await historyStore.deleteMany(ids);
      await memoryStore.deleteMany(memoryIds);
      refreshQueryMap();
    },
    () => refreshQueryMap()
  );
  const tree = new DatabaseTreeProvider(connectionManager);
  context.subscriptions.push(connectionManager.onDidChangeActiveConnections(() => {
    refreshQueryMap();
    tree.refresh();
    updateSqlConnectionStatus(vscode23.window.activeTextEditor);
    const activeDocument = vscode23.window.activeTextEditor?.document;
    const connection = activeDocument?.languageId === "sql" ? connectionForDocument(activeDocument) : void 0;
    if (connection && connectionManager.isConnected(connection.id)) {
      schemaContext.refreshDefaultSchemaInBackground(connection);
    }
  }));
  const treeView = vscode23.window.createTreeView("databaseExplorer", { treeDataProvider: tree, showCollapseAll: true });
  context.subscriptions.push(
    treeView,
    highlighter,
    queryOutput,
    sqlDiagnostics,
    vscode23.window.registerWebviewViewProvider(ResultsPanelProvider.viewType, results),
    vscode23.window.registerWebviewViewProvider(QueryMapProvider.viewType, queryMap)
  );
  const status = vscode23.window.createStatusBarItem(vscode23.StatusBarAlignment.Left, 90);
  status.command = "database.pickConnection";
  status.text = "$(database) Database";
  status.show();
  context.subscriptions.push(status, statementRunningDecoration, statementCompletedDecoration, statementFailedDecoration);
  const sqlCodeLensRefresh = new vscode23.EventEmitter();
  context.subscriptions.push(sqlCodeLensRefresh);
  context.subscriptions.push(registerSqlCompletions(connectionManager, schemaContext, sectionService, connectionForDocument, context));
  context.subscriptions.push(registerSqlConnectionCodeLens(sqlConnectionLensTitle, sectionService, sqlCodeLensRefresh.event));
  context.subscriptions.push(vscode23.window.onDidChangeActiveTextEditor((editor) => {
    queryMap.updateFromEditor(editor);
    syncResultsToEditor(editor);
    updateSqlConnectionStatus(editor);
    highlightActiveSqlSection(editor);
    highlighter.refreshVisibleEditors();
    updateSqlDiagnostics(editor?.document, editor?.selection);
  }));
  context.subscriptions.push(vscode23.window.onDidChangeTextEditorSelection((event) => {
    highlightActiveSqlSection(event.textEditor);
    updateSqlDiagnostics(event.textEditor.document, event.selections[0]);
  }));
  context.subscriptions.push(vscode23.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode23.window.activeTextEditor;
    if (editor?.document.uri.toString() === event.document.uri.toString()) {
      queryMap.updateFromEditor(editor);
      highlightActiveSqlSection(editor);
    }
    updateSqlDiagnostics(event.document, editor?.selection);
  }));
  context.subscriptions.push(vscode23.workspace.onDidCloseTextDocument((document) => {
    sqlDiagnostics.delete(document.uri);
  }));
  refreshQueryMap();
  void schemaContext.warmFromDisk(connectionManager.getConnections());
  queryMap.updateFromEditor(vscode23.window.activeTextEditor);
  queryMap.updateResults(results.getTabs());
  highlightActiveSqlSection(vscode23.window.activeTextEditor);
  updateSqlConnectionStatus(vscode23.window.activeTextEditor);
  for (const document of vscode23.workspace.textDocuments) {
    updateSqlDiagnostics(document);
  }
  const register = (command, callback) => {
    context.subscriptions.push(vscode23.commands.registerCommand(command, async (...args) => {
      try {
        return await callback(...args);
      } catch (error) {
        logger.error(command, error);
        void vscode23.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        return void 0;
      }
    }));
  };
  function refreshQueryMap() {
    const connections = connectionManager.getConnections();
    const knownConnectionIds = new Set(connections.map((connection) => connection.id));
    queryMap.updateConsoles(
      activeSessionRecords(knownConnectionIds),
      connections,
      connectionManager.getActiveConnections().map((connection) => connection.config.id)
    );
    void pruneMissingConsoleRecords();
    void pruneUnknownConnectionRecords();
  }
  function activeSessionRecords(knownConnectionIds = currentConnectionIds()) {
    const consoles = consoleStore.getAll();
    const knownConsoles = consoles.filter((record) => knownConnectionIds.has(record.connectionId));
    const consoleUris = new Set(knownConsoles.map((record) => record.documentUri));
    const projectSessions = sqlDocumentConnections.getAll().filter((record) => knownConnectionIds.has(record.connectionId) && !!record.lastTouchedAt && !consoleUris.has(record.documentUri)).map((record) => ({
      id: projectSqlSessionId(record.documentUri),
      connectionId: record.connectionId,
      documentUri: record.documentUri,
      lastExecutedRange: record.lastExecutedRange,
      lastTouchedAt: record.lastTouchedAt,
      createdAt: record.updatedAt,
      updatedAt: record.updatedAt
    }));
    return [
      ...knownConsoles,
      ...projectSessions
    ];
  }
  function projectSqlSessionId(documentUri) {
    return `${PROJECT_SQL_SESSION_PREFIX2}${encodeURIComponent(documentUri)}`;
  }
  function documentUriFromProjectSqlSessionId(id) {
    if (!id.startsWith(PROJECT_SQL_SESSION_PREFIX2)) {
      return void 0;
    }
    try {
      return decodeURIComponent(id.slice(PROJECT_SQL_SESSION_PREFIX2.length));
    } catch {
      return void 0;
    }
  }
  async function untrackActiveSession(id) {
    const projectDocumentUri = documentUriFromProjectSqlSessionId(id);
    if (projectDocumentUri) {
      await sqlDocumentConnections.delete(projectDocumentUri);
      return;
    }
    await consoleStore.delete(id);
  }
  async function clearActiveSessionsById(ids) {
    const consoleIds = [];
    const projectDocumentUris = [];
    for (const id of ids) {
      const projectDocumentUri = documentUriFromProjectSqlSessionId(id);
      if (projectDocumentUri) {
        projectDocumentUris.push(projectDocumentUri);
      } else {
        consoleIds.push(id);
      }
    }
    await consoleStore.deleteMany(consoleIds);
    await Promise.all(projectDocumentUris.map((documentUri) => sqlDocumentConnections.delete(documentUri)));
  }
  function beginDocumentExecution(documentUri) {
    runningDocuments.set(documentUri, (runningDocuments.get(documentUri) ?? 0) + 1);
    queryMap.updateRunningDocuments([...runningDocuments.keys()]);
    return () => {
      const count = (runningDocuments.get(documentUri) ?? 1) - 1;
      if (count > 0) {
        runningDocuments.set(documentUri, count);
      } else {
        runningDocuments.delete(documentUri);
      }
      queryMap.updateRunningDocuments([...runningDocuments.keys()]);
    };
  }
  function createStatementStatusUpdater(editor, range, sql) {
    const statements = splitSqlStatements(sql);
    const sqlParts = statements.length ? statements : [{ sql, start: 0, end: sql.length }];
    const baseOffset = editor.document.offsetAt(range.start);
    const statuses = sqlParts.map((statement) => ({
      range: new vscode23.Range(
        editor.document.positionAt(baseOffset + statement.start),
        editor.document.positionAt(baseOffset + statement.start)
      ),
      status: void 0
    }));
    const apply = () => {
      editor.setDecorations(statementRunningDecoration, statuses.filter((item) => item.status === "running").map((item) => item.range));
      editor.setDecorations(statementCompletedDecoration, statuses.filter((item) => item.status === "completed").map((item) => item.range));
      editor.setDecorations(statementFailedDecoration, statuses.filter((item) => item.status === "failed").map((item) => item.range));
    };
    apply();
    return (progress) => {
      const item = statuses[progress.statementIndex];
      if (!item) {
        return;
      }
      item.status = progress.status === "started" ? "running" : progress.status === "completed" ? "completed" : "failed";
      apply();
    };
  }
  function queryConsoleHistoryItems(knownConnectionIds = currentConnectionIds()) {
    const consoleUris = queryConsoleDocumentUris(consoleStore.getAll().filter((record) => knownConnectionIds.has(record.connectionId)));
    return historyStore.getAll().filter((item) => knownConnectionIds.has(item.connectionId) && isQueryConsoleHistoryItem(item, consoleUris));
  }
  async function markActiveSessionExecuted(documentUri, connectionId, range) {
    if (queryConsoleDocumentUris(consoleStore.getAll()).has(documentUri)) {
      await consoleStore.markExecuted(documentUri, range);
      return;
    }
    await sqlDocumentConnections.markExecuted(documentUri, connectionId, range);
  }
  async function pruneMissingConsoleRecords() {
    if (pruningMissingConsoles) {
      return;
    }
    pruningMissingConsoles = true;
    try {
      const removed = await consoleStore.pruneMissingDocuments();
      if (removed > 0) {
        queryMap.updateConsoles(
          activeSessionRecords(),
          connectionManager.getConnections(),
          connectionManager.getActiveConnections().map((connection) => connection.config.id)
        );
      }
    } finally {
      pruningMissingConsoles = false;
    }
  }
  function currentConnectionIds() {
    return new Set(connectionManager.getConnections().map((connection) => connection.id));
  }
  async function pruneUnknownConnectionRecords() {
    if (pruningUnknownConnections) {
      return;
    }
    pruningUnknownConnections = true;
    try {
      const knownConnectionIds = currentConnectionIds();
      const orphaned = orphanedConnectionRecordIds({
        consoles: consoleStore.getAll(),
        sqlDocuments: sqlDocumentConnections.getAll(),
        history: historyStore.getAll(),
        memory: memoryStore.getAll()
      }, knownConnectionIds);
      const removedCount = orphaned.consoleIds.length + orphaned.sqlDocumentUris.length + orphaned.historyIds.length + orphaned.memoryIds.length;
      if (!removedCount) {
        return;
      }
      await Promise.all([
        consoleStore.deleteMany(orphaned.consoleIds),
        sqlDocumentConnections.deleteMany(orphaned.sqlDocumentUris),
        historyStore.deleteMany(orphaned.historyIds),
        memoryStore.deleteMany(orphaned.memoryIds)
      ]);
      queryMap.updateConsoles(
        activeSessionRecords(currentConnectionIds()),
        connectionManager.getConnections(),
        connectionManager.getActiveConnections().map((connection) => connection.config.id)
      );
    } finally {
      pruningUnknownConnections = false;
    }
  }
  function documentConnectionBindings() {
    return [...consoleStore.getAll(), ...sqlDocumentConnections.getAll()];
  }
  function resolveConnectionForDocument(document) {
    return resolveDocumentConnection(
      document.uri.toString(),
      documentConnectionBindings(),
      connectionManager.getConnections()
    );
  }
  function connectionForDocument(document) {
    return resolveConnectionForDocument(document).connection;
  }
  function connectionFromArg(node) {
    const id = connectionIdFromArg(node);
    return id ? connectionManager.getConnection(id) : void 0;
  }
  function connectionIdForDocumentUri(documentUri) {
    return resolveDocumentConnection(
      documentUri,
      documentConnectionBindings(),
      connectionManager.getConnections()
    ).connection?.id;
  }
  function activeConnectionId() {
    const editor = vscode23.window.activeTextEditor;
    return editor?.document.languageId === "sql" ? connectionForDocument(editor.document)?.id : void 0;
  }
  function syncResultsToEditor(editor) {
    if (!editor || editor.document.languageId !== "sql") {
      return;
    }
    const documentUri = editor.document.uri.toString();
    const isTrackedConsole = consoleStore.getAll().some((record) => record.documentUri === documentUri);
    const hasResults = results.getTabs().some((tab) => tab.sourceDocumentUri === documentUri);
    const connection = connectionForDocument(editor.document);
    if ((isTrackedConsole || hasResults) && connection) {
      results.setActiveConnection(connection.id);
    }
  }
  function updateSqlConnectionStatus(editor) {
    if (!editor || editor.document.languageId !== "sql") {
      status.command = "database.pickConnection";
      status.text = "$(database) Database";
      return;
    }
    const resolved = resolveConnectionForDocument(editor.document);
    status.command = "database.setSqlFileConnection";
    if (resolved.connection) {
      status.text = `$(database) ${resolved.connection.name}`;
    } else if (resolved.isBound) {
      status.text = "$(warning) Missing database";
    } else {
      status.text = "$(database) Select Database";
    }
  }
  function sqlConnectionLensTitle(document) {
    const resolved = resolveConnectionForDocument(document);
    if (resolved.connection) {
      return `$(database) Database: ${resolved.connection.name}`;
    }
    if (resolved.isBound) {
      return "$(warning) Database: Missing connection";
    }
    return "$(database) Select Database Connection";
  }
  function recordQueryOutput(tab) {
    const connection = connectionManager.getConnection(tab.connectionId);
    if (connection) {
      queryOutput.record(connection, tab);
    }
  }
  new QueryMemoryController(context, memoryService, connectionManager, executor, aiAdapter, async (tab) => {
    await results.addTab(tab);
    recordQueryOutput(tab);
    queryMap.updateResults(results.getTabs());
  }).register(register);
  register("database.addConnection", async () => {
    const config = await ConnectionEditorPanel.open(context, connectionManager);
    if (!config) {
      return;
    }
    await connectionManager.save(config);
    refreshQueryMap();
    tree.refresh();
  });
  register("database.editConnection", async (node) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    const existing = connectionManager.getConnection(id);
    const next = existing ? await ConnectionEditorPanel.open(context, connectionManager, existing) : void 0;
    if (next) {
      await connectionManager.save(next);
      schemaContext.invalidate(id);
      refreshQueryMap();
      tree.refresh();
    }
  });
  register("database.deleteConnection", async (node) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    const answer = await vscode23.window.showWarningMessage("Delete this connection?", { modal: true }, "Delete");
    if (answer === "Delete") {
      await connectionManager.delete(id);
      await schemaContext.deletePersistent(id);
      refreshQueryMap();
      tree.refresh();
    }
  });
  register("database.testConnection", async (node) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    const message = await connectionManager.test(id);
    void vscode23.window.showInformationMessage(`Connection successful: ${message}`);
  });
  register("database.connect", async (node) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    const connection = await connectionManager.connect(id);
    status.text = `$(database) ${connection.config.name}`;
    schemaContext.refreshDefaultSchemaInBackground(connection.config);
    refreshQueryMap();
    tree.refresh();
  });
  register("database.disconnect", async (node) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    await connectionManager.disconnect(id);
    schemaContext.invalidate(id);
    status.text = "$(database) Database";
    refreshQueryMap();
    tree.refresh();
  });
  register("database.refreshExplorer", (node) => {
    const target = databaseNodeFromArg(node) ?? treeView.selection[0];
    const connectionId = connectionIdFromArg(target);
    if (connectionId) {
      schemaContext.invalidate(connectionId);
      const connection = connectionManager.getConnection(connectionId);
      if (connection && connectionManager.isConnected(connection.id)) {
        schemaContext.refreshSchemaInBackground(connection, target ? schemaFromNode(target).schema : connection.defaultSchema ?? "public");
      }
      tree.refresh(target);
      return;
    }
    schemaContext.invalidate();
    for (const active of connectionManager.getActiveConnections()) {
      schemaContext.refreshDefaultSchemaInBackground(active.config);
    }
    tree.refresh();
  });
  register("database.showResults", () => results.show(activeConnectionId()));
  register("database.focusResults", () => results.show(activeConnectionId()));
  register("database.focusExplorer", () => vscode23.commands.executeCommand("databaseExplorer.focus"));
  register("database.showSqlMetadataStatus", () => showSqlMetadataStatus());
  register("database.setSqlFileConnection", (resource) => setSqlFileConnection(resource));
  register("database.pickConnection", async () => {
    const connection = await connectionManager.pickConnection();
    if (connection) {
      await connectionManager.setSelectedConnection(connection.id);
      status.text = `$(database) ${connection.name}`;
    }
  });
  register("database.openSqlConsole", async (node) => {
    const connection = connectionFromArg(node) ?? connectionManager.getPreferredConnection() ?? await connectionManager.pickConnection();
    const doc = await consoleStore.openOrCreate(connection, "", { reuse: false });
    await vscode23.window.showTextDocument(doc, { viewColumn: vscode23.ViewColumn.Active, preview: false });
    results.setActiveConnection(connection?.id);
    if (connection) {
      void warmSqlMetadata(connection, "Query console");
    }
    refreshQueryMap();
    queryMap.updateFromEditor(vscode23.window.activeTextEditor);
  });
  register("database.openQueryFile", async (node) => {
    const connection = connectionFromArg(node) ?? connectionManager.getPreferredConnection();
    const doc = await consoleStore.openOrCreate(connection, "", { reuse: false });
    await vscode23.window.showTextDocument(doc, { viewColumn: vscode23.ViewColumn.Active, preview: false });
    results.setActiveConnection(connection?.id);
    if (connection) {
      void warmSqlMetadata(connection, "Query file");
    }
    refreshQueryMap();
    queryMap.updateFromEditor(vscode23.window.activeTextEditor);
  });
  register("database.executeCurrentQuery", () => executeFromEditor("run"));
  register("database.executeSelection", () => executeFromEditor("selection"));
  register("database.executeFile", () => executeFromEditor("run"));
  register("database.executeStatementRange", async (uriText, startLine, startCharacter, endLine, endCharacter) => {
    const editor = vscode23.window.activeTextEditor;
    if (!editor || typeof uriText !== "string" || editor.document.uri.toString() !== uriText) {
      return;
    }
    if (![startLine, startCharacter, endLine, endCharacter].every((value) => typeof value === "number")) {
      return;
    }
    const range = new vscode23.Range(
      new vscode23.Position(startLine, startCharacter),
      new vscode23.Position(endLine, endCharacter)
    );
    const selections = selectedSqlDetections(editor);
    if (shouldRunSelectionForStatement(selections, range)) {
      await executeFromEditor("selection");
      return;
    }
    const section = sectionService.getSections(editor.document).find((item) => item.range.isEqual(range));
    await executeDetected(editor, {
      sql: editor.document.getText(range),
      range,
      index: section?.index,
      id: section?.id
    });
  });
  register("database.openTableData", async (node) => {
    if (!(node instanceof TableNode)) {
      return;
    }
    await TableDataPanel.open(context, connectionManager, node);
  });
  register("database.copyName", async (node) => {
    const name = objectName(node);
    if (name) {
      await vscode23.env.clipboard.writeText(name);
    }
  });
  register("database.copyQualifiedName", async (node) => {
    const name = qualifiedObjectName(node);
    if (name) {
      await vscode23.env.clipboard.writeText(name);
    }
  });
  async function openSqlScript(title, content, connection) {
    const doc = await openSqlEditor(connectionManager, title, content, connection);
    if (!connection) {
      return;
    }
    await sqlDocumentConnections.set(doc.uri.toString(), connection.id);
    await connectionManager.setSelectedConnection(connection.id);
    results.setActiveConnection(connection.id);
    updateSqlConnectionStatus(vscode23.window.activeTextEditor);
    refreshQueryMap();
    sqlCodeLensRefresh.fire();
  }
  register("database.showObjectDdl", async (node) => {
    const sql = await objectDdl(connectionManager, node);
    if (sql) {
      await openSqlScript(`${objectName(node) ?? "Object"} DDL`, `${sql}
`, schemaFromNode(node).connection);
    }
  });
  register("database.generateSelect", async (node) => {
    const target = tableLikeTarget(node);
    if (target) {
      await openSqlScript(`SELECT ${target.name}`, `select *
from ${qualifiedName(target.schema, target.name)}
limit 100;
`, target.connection);
    }
  });
  register("database.generateInsert", async (node) => {
    const target = tableLikeTarget(node);
    if (!target) {
      return;
    }
    const columns = await connectionManager.getDriver(target.connection.type).getColumns(target.connection.id, target.schema, target.name);
    const writable = columns.filter((column) => !column.defaultValue).map((column) => quoteIdentifier(column.name));
    const sql = writable.length ? `insert into ${qualifiedName(target.schema, target.name)} (${writable.join(", ")})
values (${writable.map(() => "null").join(", ")});
` : `insert into ${qualifiedName(target.schema, target.name)}
default values;
`;
    await openSqlScript(`INSERT ${target.name}`, sql, target.connection);
  });
  register("database.generateUpdate", async (node) => {
    const target = tableLikeTarget(node);
    if (!target) {
      return;
    }
    await openSqlScript(`UPDATE ${target.name}`, `update ${qualifiedName(target.schema, target.name)}
set ${quoteIdentifier("column_name")} = null
where ${quoteIdentifier("id")} = '<id>';
`, target.connection);
  });
  register("database.generateDelete", async (node) => {
    const target = tableLikeTarget(node);
    if (target) {
      await openSqlScript(`DELETE ${target.name}`, `delete from ${qualifiedName(target.schema, target.name)}
where ${quoteIdentifier("id")} = '<id>';
`, target.connection);
    }
  });
  register("database.modifyTable", async (node) => {
    const target = tableLikeTarget(node);
    if (target) {
      await openSqlScript(`ALTER ${target.name}`, `alter table ${qualifiedName(target.schema, target.name)}
  add column ${quoteIdentifier("new_column")} text;
`, target.connection);
    }
  });
  register("database.renameObject", async (node) => {
    const sql = renameTemplate(node);
    if (sql) {
      await openSqlScript(`Rename ${objectName(node)}`, sql, schemaFromNode(node).connection);
    }
  });
  register("database.dropObject", async (node) => {
    const sql = dropTemplate(node);
    if (sql) {
      await openSqlScript(`Drop ${objectName(node)}`, sql, schemaFromNode(node).connection);
    }
  });
  register("database.newObject", async (node) => {
    const picked = await vscode23.window.showQuickPick([
      { label: "Query Console", command: "database.openSqlConsole" },
      { label: "Query File", command: "database.openQueryFile" },
      { label: "CREATE TABLE script", command: "database.newTable" },
      { label: "CREATE VIEW script", command: "database.newView" },
      { label: "CREATE MATERIALIZED VIEW script", command: "database.newMaterializedView" },
      { label: "ADD COLUMN script", command: "database.newColumn" },
      { label: "CREATE INDEX script", command: "database.newIndex" },
      { label: "UNIQUE KEY script", command: "database.newUniqueKey" },
      { label: "FOREIGN KEY script", command: "database.newForeignKey" },
      { label: "CHECK script", command: "database.newCheck" },
      { label: "CREATE SCHEMA script", command: "database.newSchema" },
      { label: "CREATE SEQUENCE script", command: "database.newSequence" }
    ], { placeHolder: "Generate database SQL script" });
    if (picked) {
      await vscode23.commands.executeCommand(picked.command, node);
    }
  });
  register("database.newTable", async (node) => openSqlScript("New Table", newObjectTemplate(node, "table"), schemaFromNode(node).connection));
  register("database.newView", async (node) => openSqlScript("New View", newObjectTemplate(node, "view"), schemaFromNode(node).connection));
  register("database.newMaterializedView", async (node) => openSqlScript("New Materialized View", newObjectTemplate(node, "materialized_view"), schemaFromNode(node).connection));
  register("database.newColumn", async (node) => openSqlScript("New Column", newObjectTemplate(node, "column"), schemaFromNode(node).connection));
  register("database.newIndex", async (node) => openSqlScript("New Index", newObjectTemplate(node, "index"), schemaFromNode(node).connection));
  register("database.newUniqueKey", async (node) => openSqlScript("New Unique Key", newObjectTemplate(node, "unique_key"), schemaFromNode(node).connection));
  register("database.newForeignKey", async (node) => openSqlScript("New Foreign Key", newObjectTemplate(node, "foreign_key"), schemaFromNode(node).connection));
  register("database.newCheck", async (node) => openSqlScript("New Check", newObjectTemplate(node, "check"), schemaFromNode(node).connection));
  register("database.newSchema", async (node) => openSqlScript("New Schema", newObjectTemplate(node, "schema"), schemaFromNode(node).connection));
  register("database.newSequence", async (node) => openSqlScript("New Sequence", newObjectTemplate(node, "sequence"), schemaFromNode(node).connection));
  register("database.quickDocumentation", async (node) => {
    const docs = await quickDocumentation(connectionManager, node);
    if (docs) {
      void vscode23.window.showInformationMessage(docs, { modal: true });
    }
  });
  register("database.showQueryHistory", async () => {
    const connection = connectionManager.getPreferredConnection();
    const picked = await vscode23.window.showQuickPick(queryConsoleHistoryItems().filter((item) => !connection || item.connectionId === connection.id).map((item) => ({
      label: `${item.favorite ? "$(star-full) " : ""}${item.sql.replace(/\s+/g, " ").slice(0, 90)}`,
      description: `${item.status}${item.rowCount !== void 0 ? ` - ${item.rowCount} rows` : ""}`,
      detail: `${new Date(item.executedAt).toLocaleString()}${item.sourceFile ? ` - ${item.sourceFile}` : ""}`,
      item
    })), { placeHolder: "Query console history", matchOnDetail: true });
    if (picked) {
      const action = await vscode23.window.showQuickPick([
        { label: "Open in Console", action: "open" },
        { label: picked.item.favorite ? "Remove Favorite" : "Favorite", action: "favorite" },
        { label: "Copy SQL", action: "copy" },
        { label: "Delete", action: "delete" }
      ], { placeHolder: "History action" });
      if (action?.action === "open") {
        await openHistoryItem(picked.item);
      } else if (action?.action === "favorite") {
        await historyStore.update({ ...picked.item, favorite: !picked.item.favorite });
      } else if (action?.action === "copy") {
        await vscode23.env.clipboard.writeText(picked.item.sql);
      } else if (action?.action === "delete") {
        await historyStore.delete(picked.item.id);
      }
    }
  });
  register("database.aiFixSql", () => runAi("fix"));
  register("database.aiExplainSql", () => runAi("explain"));
  async function executeFromEditor(mode, options = {}) {
    const editor = vscode23.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const selectedDetections = mode === "file" ? [] : selectedSqlDetections(editor);
    let detections;
    if (mode === "file") {
      detections = [{ sql: editor.document.getText(), range: new vscode23.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length)) }];
    } else if (mode === "run") {
      const detected = sectionService.detectExecutable(editor.document, editor.selection);
      detections = selectedDetections.length > 0 ? selectedDetections : detected ? [detected] : [{ sql: editor.document.getText(), range: new vscode23.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length)) }];
    } else if (mode === "selection" || selectedDetections.length > 0) {
      detections = selectedDetections;
    } else {
      const detected = sectionService.detectExecutable(editor.document, editor.selection);
      detections = detected ? [detected] : [];
    }
    if (!detections.some((detected) => detected.sql.trim())) {
      void vscode23.window.showInformationMessage("No SQL section to run.");
      return;
    }
    const forceNewResultTab = detections.length > 1;
    for (const detected of detections) {
      await executeDetected(editor, detected, { forceNewResultTab, maxRows: options.maxRows });
    }
  }
  async function executeActiveMultiStatementSelection(maxRows) {
    const editor = vscode23.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "sql") {
      return false;
    }
    const selections = selectedSqlDetections(editor);
    if (!selections.some((selection) => splitSqlStatements(selection.sql).length > 1)) {
      return false;
    }
    await executeFromEditor("selection", { maxRows });
    return true;
  }
  function highlightActiveSqlSection(editor) {
    if (!editor || editor.document.languageId !== "sql") {
      return;
    }
    const section = selectedSqlDetections(editor)[0] ?? sectionService.detectExecutable(editor.document, editor.selection);
    if (!section?.sql.trim()) {
      highlighter.clear(editor.document.uri.toString());
      return;
    }
    highlighter.highlight(editor, {
      startLine: section.range.start.line,
      startColumn: section.range.start.character,
      endLine: section.range.end.line,
      endColumn: section.range.end.character
    });
  }
  function selectedSqlDetections(editor) {
    return editor.selections.filter((selection) => !selection.isEmpty).map((selection) => trimSelection(editor.document, selection)).filter((range) => !range.isEmpty).sort(compareRanges).filter((range, index, ranges) => index === 0 || !range.isEqual(ranges[index - 1])).map((range) => ({
      sql: editor.document.getText(range),
      range
    }));
  }
  function updateSqlDiagnostics(document, selection) {
    if (!document || document.languageId !== "sql") {
      return;
    }
    const documentUri = document.uri.toString();
    const version = (diagnosticVersions.get(documentUri) ?? 0) + 1;
    diagnosticVersions.set(documentUri, version);
    const existingTimer = diagnosticTimers.get(documentUri);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    sqlDiagnostics.set(document.uri, sectionService.getSyntaxIssues(document));
    const timer = setTimeout(() => {
      diagnosticTimers.delete(documentUri);
      const resolved = resolveConnectionForDocument(document);
      void diagnosticsService.getDiagnostics(document, selection, resolved.connection ?? null).then((diagnostics) => {
        if (diagnosticVersions.get(documentUri) === version) {
          sqlDiagnostics.set(document.uri, diagnostics);
        }
      });
    }, 450);
    diagnosticTimers.set(documentUri, timer);
  }
  async function showSqlMetadataStatus() {
    const editor = vscode23.window.activeTextEditor;
    const connection = editor?.document.languageId === "sql" ? connectionForDocument(editor.document) : connectionManager.getPreferredConnection();
    if (!connection) {
      void vscode23.window.showInformationMessage("No database connection is selected for this SQL editor.");
      return;
    }
    const status2 = await schemaContext.metadataStatus(connection);
    const entry = status2.entry;
    const age = entry?.loadedAt ? formatAge(Date.now() - entry.loadedAt) : "never";
    const tableCount = entry ? entry.tables.length + entry.views.length : 0;
    const columnCount = entry ? Object.values(entry.columns).reduce((sum, columns) => sum + columns.length, 0) : 0;
    const problem = metadataProblem(status2);
    const cause = metadataCause(status2);
    const fix = metadataFix(status2);
    const content = [
      "# SQL Metadata Status",
      "",
      `Problem: ${problem}`,
      `Cause: ${cause}`,
      `Fix: ${fix}`,
      "",
      "## Details",
      "",
      `- Connection: ${connection.name} (${connection.id})`,
      `- Connected: ${status2.connected ? "yes" : "no"}`,
      `- Schema: ${status2.schemaName}`,
      `- Cache status: ${entry?.status ?? "empty"}`,
      `- Fresh enough for diagnostics: ${status2.freshForDiagnostics ? "yes" : "no"}`,
      `- Refresh running: ${status2.refreshRunning ? "yes" : "no"}`,
      `- Source: ${entry?.source ?? "none"}`,
      `- Age: ${age}`,
      `- Schemas cached: ${entry?.schemas.length ?? 0}`,
      `- Tables/views cached: ${tableCount}`,
      `- Columns cached: ${columnCount}`,
      `- Last error: ${entry?.errorMessage ?? "none"}`,
      `- Storage fallback: ${status2.storageError ? `in-memory only (${status2.storageError})` : "disk cache available"}`,
      ""
    ].join("\n");
    const doc = await vscode23.workspace.openTextDocument({ language: "markdown", content });
    await vscode23.window.showTextDocument(doc, { preview: true, viewColumn: vscode23.ViewColumn.Beside });
  }
  async function warmSqlMetadata(connection, surface) {
    try {
      await connectAndRefreshSqlMetadata(connectionManager, schemaContext, connection);
    } catch (error) {
      void vscode23.window.showWarningMessage(`${surface} is bound to ${connection.name}, but metadata refresh could not connect: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async function setSqlFileConnection(resource) {
    const document = await sqlDocumentFromArg(resource);
    if (!document) {
      void vscode23.window.showInformationMessage("Open a SQL file before selecting a database connection.");
      return;
    }
    const connection = await connectionManager.pickConnection();
    if (!connection) {
      return;
    }
    await sqlDocumentConnections.set(document.uri.toString(), connection.id);
    await connectionManager.setSelectedConnection(connection.id);
    try {
      if (!connectionManager.isConnected(connection.id)) {
        await connectionManager.connect(connection.id);
      }
    } catch (error) {
      void vscode23.window.showWarningMessage(`SQL file is bound to ${connection.name}, but connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    schemaContext.invalidate(connection.id);
    schemaContext.refreshDefaultSchemaInBackground(connection);
    results.setActiveConnection(connection.id);
    updateSqlConnectionStatus(vscode23.window.activeTextEditor);
    updateSqlDiagnostics(document, vscode23.window.activeTextEditor?.document.uri.toString() === document.uri.toString() ? vscode23.window.activeTextEditor.selection : void 0);
    refreshQueryMap();
    sqlCodeLensRefresh.fire();
  }
  async function sqlDocumentFromArg(resource) {
    const document = resource instanceof vscode23.Uri ? await vscode23.workspace.openTextDocument(resource) : vscode23.window.activeTextEditor?.document;
    if (!document) {
      return void 0;
    }
    const isSqlFile = document.languageId === "sql" || document.uri.fsPath.toLowerCase().endsWith(".sql");
    return isSqlFile ? document : void 0;
  }
  async function executeDetected(editor, detected, options = {}) {
    const resolved = resolveConnectionForDocument(editor.document);
    if (resolved.isBound && !resolved.connection) {
      void vscode23.window.showErrorMessage(`This SQL console is bound to a connection that no longer exists: ${resolved.boundConnectionId}`);
      return;
    }
    const connection = resolved.connection ?? await connectionManager.pickConnection();
    if (!connection) {
      return;
    }
    if (!resolved.isBound) {
      await sqlDocumentConnections.set(editor.document.uri.toString(), connection.id);
      results.setActiveConnection(connection.id);
      updateSqlConnectionStatus(editor);
      sqlCodeLensRefresh.fire();
    }
    const decoration = vscode23.window.createTextEditorDecorationType({ backgroundColor: new vscode23.ThemeColor("editor.findMatchHighlightBackground") });
    editor.setDecorations(decoration, [detected.range]);
    let endDocumentExecution;
    try {
      const maxRows = options.maxRows ?? configuredDefaultMaxRows();
      const documentUri = editor.document.uri.toString();
      const sourceOrigin = executionOriginForDocument(documentUri, queryConsoleDocumentUris(consoleStore.getAll()));
      const executedRange = {
        startLine: detected.range.start.line,
        startColumn: detected.range.start.character,
        endLine: detected.range.end.line,
        endColumn: detected.range.end.character
      };
      await markActiveSessionExecuted(documentUri, connection.id, executedRange);
      refreshQueryMap();
      endDocumentExecution = beginDocumentExecution(documentUri);
      const statementCount = splitSqlStatements(detected.sql).length || 1;
      const updateStatementStatus = createStatementStatusUpdater(editor, detected.range, detected.sql);
      queryOutput.recordExecutionStarted(connection, editor.document.fileName, statementCount);
      const runningTab = await results.addTab(createRunningResultTab(connection, detected.sql, maxRows, {
        origin: sourceOrigin,
        fileName: editor.document.fileName,
        documentUri,
        queryId: detected.id,
        sectionIndex: detected.index,
        range: executedRange
      }), { forceNew: options.forceNewResultTab });
      queryMap.updateResults(results.getTabs());
      const tab = await executor.execute({
        connectionId: connection.id,
        sql: detected.sql,
        onProgress: (progress) => {
          updateStatementStatus(progress);
          queryOutput.recordProgress(connection, progress);
        },
        maxRows,
        source: {
          origin: sourceOrigin,
          fileName: editor.document.fileName,
          documentUri,
          queryId: detected.id,
          sectionIndex: detected.index,
          range: {
            startLine: detected.range.start.line,
            startColumn: detected.range.start.character,
            endLine: detected.range.end.line,
            endColumn: detected.range.end.character
          }
        }
      });
      await results.addTab({ ...tab, id: runningTab.id, pinned: runningTab.pinned, customTitle: runningTab.customTitle }, { replaceTabId: runningTab.id });
      recordQueryOutput(tab);
      await highlighter.reveal(documentUri, rangeToPlain(detected.range), detected.sql);
      queryMap.updateResults(results.getTabs());
      await markActiveSessionExecuted(documentUri, connection.id, executedRange);
      refreshQueryMap();
      status.text = `$(database) ${connection.name} ${tab.executionTimeMs ?? 0}ms`;
    } finally {
      endDocumentExecution?.();
      decoration.dispose();
    }
  }
  function createRunningResultTab(connection, sql, maxRows, source) {
    const now = Date.now();
    return {
      id: createId("tab"),
      title: resultTitle(sql, source.fileName),
      pinned: false,
      connectionId: connection.id,
      databaseType: connection.type,
      databaseName: connection.database,
      schemaName: connection.defaultSchema,
      queryText: sql,
      sourceOrigin: source.origin,
      sourceFile: source.fileName,
      sourceDocumentUri: source.documentUri,
      sourceQueryId: source.queryId,
      sourceSectionIndex: source.sectionIndex,
      sourceRange: source.range,
      executionStatus: "running",
      executionStartedAt: now,
      maxRows,
      resultSets: [],
      activeResultSetIndex: 0,
      filters: [],
      sort: [],
      columnState: [],
      createdAt: now,
      updatedAt: now
    };
  }
  function resultTitle(sql, fileName) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    const from = normalized.match(/\bfrom\s+("?[\w.]+"?)/i)?.[1];
    const keyword = normalized.match(/^\w+/)?.[0]?.toUpperCase() ?? "SQL";
    if (from) {
      return `${keyword} ${from.replace(/"/g, "")}`;
    }
    if (normalized) {
      return keyword;
    }
    return fileName?.split(/[\\/]/).pop() ?? "SQL";
  }
  async function runAi(action) {
    if (!await aiAdapter.isAvailable()) {
      void vscode23.window.showInformationMessage("AI SQL actions require an available VS Code language model.");
      return;
    }
    const editor = vscode23.window.activeTextEditor;
    const connection = editor ? connectionForDocument(editor.document) : void 0;
    if (!editor || !connection) {
      void vscode23.window.showInformationMessage("Open a SQL editor and select a connection first.");
      return;
    }
    const section = sectionService.detect(editor.document, editor.selection);
    const entry = await schemaContext.loadDefaultSchema(connection);
    const sql = await aiAdapter.send({
      action,
      selectedSql: section?.sql,
      relevantSchema: {
        connectionName: connection.name,
        databaseType: connection.type,
        databaseName: connection.database,
        defaultSchema: connection.defaultSchema,
        tables: [...entry.tables, ...entry.views].slice(0, 50).map((table) => ({
          schema: table.schema,
          name: table.name,
          type: table.type
        }))
      }
    });
    const doc = await vscode23.workspace.openTextDocument({ language: "sql", content: `${sql}
` });
    await vscode23.window.showTextDocument(doc, { preview: true, viewColumn: vscode23.ViewColumn.Beside });
  }
  async function openHistoryItem(item) {
    if (item.documentUri) {
      try {
        const doc2 = await vscode23.workspace.openTextDocument(vscode23.Uri.parse(item.documentUri));
        const editor2 = await vscode23.window.showTextDocument(doc2, { preview: false });
        const currentText = doc2.getText();
        if (item.sourceRange && currentText.includes(item.sql.trim())) {
          const range = rangeFromPlain2(item.sourceRange);
          editor2.selection = new vscode23.Selection(range.start, range.end);
          editor2.revealRange(range);
        } else {
          const fullRange = new vscode23.Range(doc2.positionAt(0), doc2.positionAt(currentText.length));
          await editor2.edit((edit) => edit.replace(fullRange, `${item.sql}
`));
        }
        results.setActiveConnection(item.connectionId);
        refreshQueryMap();
        return;
      } catch {
      }
    }
    const doc = await consoleStore.openOrCreate(connectionManager.getConnection(item.connectionId), `${item.sql}
`, { reuse: false });
    const editor = await vscode23.window.showTextDocument(doc, { preview: false });
    results.setActiveConnection(item.connectionId);
    refreshQueryMap();
  }
  async function revealSourceForTab(tab) {
    if (!tab.sourceDocumentUri || !tab.sourceRange) {
      return;
    }
    await highlighter.reveal(tab.sourceDocumentUri, tab.sourceRange, tab.queryText);
    const editor = vscode23.window.activeTextEditor;
    queryMap.updateFromEditor(editor?.document.uri.toString() === tab.sourceDocumentUri ? editor : void 0);
  }
}
function deactivate() {
}
function connectionIdFromArg(value) {
  const maybe = value;
  return maybe?.connection?.id ?? maybe?.id;
}
function databaseNodeFromArg(value) {
  if (value instanceof CatalogNode || value instanceof ColumnNode || value instanceof ConnectionNode || value instanceof FolderNode || value instanceof SchemaNode || value instanceof SchemasNode || value instanceof TableNode || value instanceof ViewNode) {
    return value;
  }
  return void 0;
}
function trimSelection(document, selection) {
  const text = document.getText(selection);
  const leading = text.match(/^\s*/)?.[0].length ?? 0;
  const trailing = text.match(/\s*$/)?.[0].length ?? 0;
  const startOffset = document.offsetAt(selection.start) + leading;
  const endOffset = document.offsetAt(selection.end) - trailing;
  return new vscode23.Range(document.positionAt(startOffset), document.positionAt(Math.max(startOffset, endOffset)));
}
function compareRanges(a, b) {
  return a.start.compareTo(b.start) || a.end.compareTo(b.end);
}
function metadataProblem(status) {
  if (!status.entry) {
    return "No metadata snapshot is available for this connection and schema.";
  }
  if (status.entry.status === "ready") {
    return "Metadata is fresh enough for schema diagnostics and autocomplete.";
  }
  if (status.entry.status === "stale") {
    return "Metadata exists, but it is stale, so autocomplete may use it and diagnostics stay quiet.";
  }
  if (status.entry.status === "loading") {
    return "Metadata refresh is currently running.";
  }
  return "The last metadata refresh failed, so diagnostics stay quiet.";
}
function metadataCause(status) {
  if (!status.entry) {
    return status.connected ? "The cache has not finished warming yet." : "The connection is not active and no disk snapshot was found.";
  }
  if (status.entry.status === "ready") {
    return "The cache was loaded from disk or live database metadata within the freshness window.";
  }
  if (status.entry.status === "stale") {
    return "The last successful metadata load is older than the freshness window.";
  }
  if (status.entry.status === "loading") {
    return "The extension is refreshing schema metadata in the background.";
  }
  return status.entry.errorMessage ?? "The database driver could not refresh metadata.";
}
function metadataFix(status) {
  if (status.entry?.status === "ready") {
    return "No action needed.";
  }
  if (status.connected) {
    return "Wait for the background refresh or run Database: Refresh Database Explorer.";
  }
  return "Connect this database, then open a query console or run Database: Refresh Database Explorer.";
}
function formatAge(ageMs) {
  if (ageMs < 6e4) {
    return `${Math.max(0, Math.round(ageMs / 1e3))}s`;
  }
  if (ageMs < 60 * 6e4) {
    return `${Math.round(ageMs / 6e4)}m`;
  }
  return `${Math.round(ageMs / (60 * 6e4))}h`;
}
function registerSqlCompletions(connectionManager, schemaContext, sectionService, getConnectionForDocument, context) {
  const keywords = [
    "select",
    "from",
    "where",
    "join",
    "left join",
    "inner join",
    "group by",
    "order by",
    "limit",
    "with",
    "insert into",
    "update",
    "delete from",
    "create table",
    "alter table",
    "drop table",
    "case",
    "when",
    "then",
    "else",
    "end",
    "distinct",
    "having",
    "union all"
  ];
  return vscode23.languages.registerCompletionItemProvider("sql", {
    async provideCompletionItems(document, position) {
      const linePrefix = document.lineAt(position).text.slice(0, position.character);
      const items = keywords.map((keyword) => {
        const item = new vscode23.CompletionItem(keyword, vscode23.CompletionItemKind.Keyword);
        item.insertText = keyword;
        return item;
      });
      const connection = getConnectionForDocument(document);
      if (!connection) {
        return items;
      }
      try {
        const metadataItems = await getMetadataCompletionItems(connectionManager, schemaContext, sectionService, connection, document, position, linePrefix);
        if (metadataItems.length > 0) {
          await showFirstSchemaCompletionMessage(context, connection);
        }
        items.push(...metadataItems);
      } catch {
        return items;
      }
      return items;
    }
  }, ".", " ", '"');
}
async function getMetadataCompletionItems(connectionManager, schemaContext, sectionService, config, document, position, linePrefix) {
  const defaultSchema = config.defaultSchema ?? "public";
  if (connectionManager.isConnected(config.id)) {
    schemaContext.refreshDefaultSchemaInBackground(config);
  }
  const section = sectionService.detect(document, new vscode23.Selection(position, position));
  const statementPrefix = section ? document.getText(new vscode23.Range(section.range.start, position)) : linePrefix;
  const relationContext = relationCompletionContext(linePrefix);
  if (relationContext?.schema) {
    const entry2 = await schemaContext.getCachedForConnection(config, defaultSchema);
    if (!entry2 || !["ready", "stale", "error"].includes(entry2.status)) {
      return [];
    }
    return relationCompletionCandidates(entry2, relationContext).slice(0, 300).map((relation) => {
      const item = new vscode23.CompletionItem(relation.name, vscode23.CompletionItemKind.Struct);
      item.detail = `${relation.schema}.${relation.name}`;
      item.insertText = relation.name;
      return item;
    });
  }
  const aliasTarget = linePrefix.match(/(?:"([^"]+)"|(\w+))\.$/);
  if (aliasTarget) {
    const alias = stripQuotes3(aliasTarget[1] ?? aliasTarget[2]);
    const target = section?.aliases.find((item) => item.alias === alias || item.table === alias);
    const schema = target?.schema ?? defaultSchema;
    const table = target?.table ?? alias;
    const columns = await schemaContext.getCachedColumns(config, schema, table);
    if (!columns) {
      return [];
    }
    return columns.slice(0, 300).map((column) => {
      const item = new vscode23.CompletionItem(column.name, vscode23.CompletionItemKind.Field);
      item.detail = column.dataType;
      item.insertText = column.name;
      return item;
    });
  }
  if (section && unqualifiedColumnCompletionContext(statementPrefix)) {
    return getSectionColumnCompletionItems(schemaContext, config, section.tables, defaultSchema);
  }
  const entry = await schemaContext.getCachedForConnection(config, defaultSchema);
  if (!entry || !["ready", "stale", "error"].includes(entry.status)) {
    return [];
  }
  const items = [];
  for (const schema of entry.schemas.slice(0, 30)) {
    items.push(new vscode23.CompletionItem(schema.name, vscode23.CompletionItemKind.Module));
  }
  for (const table of [...entry.tables, ...entry.views].slice(0, 300)) {
    const tableItem = new vscode23.CompletionItem(table.name, vscode23.CompletionItemKind.Struct);
    tableItem.detail = `${table.schema}.${table.name}`;
    tableItem.insertText = table.name;
    items.push(tableItem);
  }
  return filterMetadataItems(items, linePrefix);
}
async function getSectionColumnCompletionItems(schemaContext, config, tables, defaultSchema) {
  const items = [];
  for (const table of tables.slice(0, 8)) {
    const columns = await schemaContext.getCachedColumns(config, table.schema ?? defaultSchema, table.table) ?? [];
    for (const column of columns) {
      if (items.some((item2) => item2.label === column.name)) {
        continue;
      }
      const item = new vscode23.CompletionItem(column.name, vscode23.CompletionItemKind.Field);
      item.detail = `${table.schema ?? defaultSchema}.${table.table} ${column.dataType}`;
      item.insertText = column.name;
      items.push(item);
    }
  }
  return items.slice(0, 300);
}
async function showFirstSchemaCompletionMessage(context, connection) {
  const key = `database.schemaCompletionReady.${connection.id}`;
  if (context.globalState.get(key)) {
    return;
  }
  await context.globalState.update(key, true);
  void vscode23.window.showInformationMessage(`Schema-backed SQL completions are ready for ${connection.name}.`);
}
function filterMetadataItems(items, linePrefix) {
  if (/\b(from|join|update|into)\s+[\w"]*$/i.test(linePrefix) || /\.$/.test(linePrefix)) {
    return items;
  }
  return items.filter((item) => item.kind === vscode23.CompletionItemKind.Keyword);
}
function registerSqlConnectionCodeLens(connectionLensTitle, sectionService, refreshEvent) {
  const emitter = new vscode23.EventEmitter();
  const documentEvents = vscode23.workspace.onDidChangeTextDocument((event) => {
    if (event.document.languageId === "sql") {
      emitter.fire();
    }
  });
  const refreshEvents = refreshEvent?.(() => emitter.fire());
  const provider = vscode23.languages.registerCodeLensProvider("sql", {
    onDidChangeCodeLenses: emitter.event,
    provideCodeLenses(document) {
      const top = new vscode23.Range(0, 0, 0, 0);
      const lenses = [
        new vscode23.CodeLens(top, {
          title: connectionLensTitle(document),
          tooltip: "Select the database connection for this SQL file",
          command: "database.setSqlFileConnection",
          arguments: [document.uri]
        })
      ];
      for (const section of sectionService.getSections(document)) {
        if (!section.sql.trim()) {
          continue;
        }
        const range = new vscode23.Range(section.range.start, section.range.start);
        lenses.push(new vscode23.CodeLens(range, {
          title: "$(play) Execute SQL Section",
          tooltip: "Run this SQL section.",
          command: "database.executeStatementRange",
          arguments: [
            document.uri.toString(),
            section.range.start.line,
            section.range.start.character,
            section.range.end.line,
            section.range.end.character
          ]
        }));
      }
      return lenses;
    }
  });
  return refreshEvents ? vscode23.Disposable.from(documentEvents, refreshEvents, provider, emitter) : vscode23.Disposable.from(documentEvents, provider, emitter);
}
function stripQuotes3(value) {
  return value.replace(/^"|"$/g, "");
}
function rangeFromPlain2(range) {
  return rangeFromPlain(range);
}
function rangeToPlain(range) {
  return {
    startLine: range.start.line,
    startColumn: range.start.character,
    endLine: range.end.line,
    endColumn: range.end.character
  };
}
async function openSqlEditor(connectionManager, title, content = "", connection = connectionManager.getPreferredConnection()) {
  const uri = vscode23.Uri.parse(`untitled:${title}${connection ? ` - ${connection.name}` : ""}.sql`);
  const doc = await vscode23.workspace.openTextDocument(uri);
  const editor = await vscode23.window.showTextDocument(doc, {
    viewColumn: vscode23.ViewColumn.Active,
    preview: false
  });
  await vscode23.languages.setTextDocumentLanguage(doc, "sql");
  if (content && doc.getText().length === 0) {
    await editor.edit((edit) => edit.insert(new vscode23.Position(0, 0), content));
  }
  return doc;
}
function configuredDefaultMaxRows() {
  const maxRows = vscode23.workspace.getConfiguration("database").get("defaultMaxRows", 500);
  return Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : void 0;
}
function objectName(node) {
  if (node instanceof ConnectionNode) {
    return node.connection.name;
  }
  if (node instanceof CatalogNode) {
    return node.connection.database;
  }
  if (node instanceof SchemaNode) {
    return node.schema.name;
  }
  if (node instanceof FolderNode) {
    return node.tableName ?? node.schema;
  }
  if (node instanceof TableNode) {
    return node.table.name;
  }
  if (node instanceof ViewNode) {
    return node.view.name;
  }
  if (node instanceof ColumnNode) {
    return node.column.name;
  }
  return void 0;
}
function qualifiedObjectName(node) {
  if (node instanceof SchemaNode) {
    return quoteIdentifier(node.schema.name);
  }
  if (node instanceof FolderNode && node.tableName) {
    return qualifiedName(node.schema, node.tableName);
  }
  if (node instanceof TableNode) {
    return qualifiedName(node.table.schema, node.table.name);
  }
  if (node instanceof ViewNode) {
    return qualifiedName(node.view.schema, node.view.name);
  }
  if (node instanceof ColumnNode) {
    return `${qualifiedName(node.column.schema, node.column.table)}.${quoteIdentifier(node.column.name)}`;
  }
  if (node instanceof CatalogNode || node instanceof ConnectionNode) {
    return node.connection.database;
  }
  return objectName(node);
}
function tableLikeTarget(node) {
  if (node instanceof TableNode) {
    return { connection: node.connection, schema: node.table.schema, name: node.table.name, kind: "table" };
  }
  if (node instanceof ViewNode) {
    return { connection: node.connection, schema: node.view.schema, name: node.view.name, kind: "view" };
  }
  if (node instanceof FolderNode && node.tableName) {
    return { connection: node.connection, schema: node.schema, name: node.tableName, kind: "table" };
  }
  if (node instanceof ColumnNode) {
    return { connection: node.connection, schema: node.column.schema, name: node.column.table, kind: "table" };
  }
  return void 0;
}
async function objectDdl(connectionManager, node) {
  if (node instanceof TableNode) {
    if (!connectionManager.isConnected(node.connection.id)) {
      await connectionManager.connect(node.connection.id);
    }
    return connectionManager.getDriver(node.connection.type).getTableDDL(node.connection.id, node.table.schema, node.table.name);
  }
  if (node instanceof SchemaNode) {
    return `create schema if not exists ${quoteIdentifier(node.schema.name)};
`;
  }
  return void 0;
}
function schemaFromNode(node) {
  if (node instanceof SchemaNode) {
    return { schema: node.schema.name, connection: node.connection };
  }
  if (node instanceof FolderNode) {
    return { schema: node.schema, connection: node.connection };
  }
  if (node instanceof TableNode) {
    return { schema: node.table.schema, connection: node.connection };
  }
  if (node instanceof ViewNode) {
    return { schema: node.view.schema, connection: node.connection };
  }
  if (node instanceof ColumnNode) {
    return { schema: node.column.schema, connection: node.connection };
  }
  const connection = node instanceof ConnectionNode || node instanceof CatalogNode ? node.connection : void 0;
  return { schema: connection?.defaultSchema ?? "public", connection };
}
function newObjectTemplate(node, type) {
  const { schema } = schemaFromNode(node);
  const table = tableLikeTarget(node);
  if (type === "table") {
    return `create table ${qualifiedName(schema, "new_table")} (
  id bigserial primary key,
  created_at timestamp not null default now()
);
`;
  }
  if (type === "view") {
    return `create or replace view ${qualifiedName(schema, "new_view")} as
select *
from ${qualifiedName(schema, "source_table")};
`;
  }
  if (type === "materialized_view") {
    return `create materialized view ${qualifiedName(schema, "new_materialized_view")} as
select *
from ${qualifiedName(schema, "source_table")};
`;
  }
  if (type === "column") {
    const target = table ?? { schema, name: "table_name" };
    return `alter table ${qualifiedName(target.schema, target.name)}
  add column ${quoteIdentifier("new_column")} text;
`;
  }
  if (type === "index") {
    const target = table ?? { schema, name: "table_name" };
    return `create index ${quoteIdentifier(`idx_${target.name}_column`)}
on ${qualifiedName(target.schema, target.name)} (${quoteIdentifier("column_name")});
`;
  }
  if (type === "unique_key") {
    const target = table ?? { schema, name: "table_name" };
    return `alter table ${qualifiedName(target.schema, target.name)}
  add constraint ${quoteIdentifier(`${target.name}_column_key`)} unique (${quoteIdentifier("column_name")});
`;
  }
  if (type === "foreign_key") {
    const target = table ?? { schema, name: "table_name" };
    return `alter table ${qualifiedName(target.schema, target.name)}
  add constraint ${quoteIdentifier(`${target.name}_fk`)} foreign key (${quoteIdentifier("column_name")})
  references ${qualifiedName(schema, "referenced_table")} (${quoteIdentifier("id")});
`;
  }
  if (type === "check") {
    const target = table ?? { schema, name: "table_name" };
    return `alter table ${qualifiedName(target.schema, target.name)}
  add constraint ${quoteIdentifier(`${target.name}_check`)} check (${quoteIdentifier("column_name")} is not null);
`;
  }
  if (type === "schema") {
    return `create schema ${quoteIdentifier("new_schema")};
`;
  }
  if (type === "sequence") {
    return `create sequence ${qualifiedName(schema, "new_sequence")}
  start with 1
  increment by 1;
`;
  }
  return "";
}
function renameTemplate(node) {
  if (node instanceof TableNode) {
    return `alter table ${qualifiedName(node.table.schema, node.table.name)}
  rename to ${quoteIdentifier(`${node.table.name}_new`)};
`;
  }
  if (node instanceof ViewNode) {
    return `alter view ${qualifiedName(node.view.schema, node.view.name)}
  rename to ${quoteIdentifier(`${node.view.name}_new`)};
`;
  }
  if (node instanceof SchemaNode) {
    return `alter schema ${quoteIdentifier(node.schema.name)}
  rename to ${quoteIdentifier(`${node.schema.name}_new`)};
`;
  }
  if (node instanceof ColumnNode) {
    return `alter table ${qualifiedName(node.column.schema, node.column.table)}
  rename column ${quoteIdentifier(node.column.name)} to ${quoteIdentifier(`${node.column.name}_new`)};
`;
  }
  return void 0;
}
function dropTemplate(node) {
  if (node instanceof TableNode) {
    return `drop table ${qualifiedName(node.table.schema, node.table.name)};
`;
  }
  if (node instanceof ViewNode) {
    return `drop view ${qualifiedName(node.view.schema, node.view.name)};
`;
  }
  if (node instanceof SchemaNode) {
    return `drop schema ${quoteIdentifier(node.schema.name)};
`;
  }
  if (node instanceof ColumnNode) {
    return `alter table ${qualifiedName(node.column.schema, node.column.table)}
  drop column ${quoteIdentifier(node.column.name)};
`;
  }
  return void 0;
}
async function quickDocumentation(connectionManager, node) {
  if (node instanceof TableNode) {
    if (!connectionManager.isConnected(node.connection.id)) {
      await connectionManager.connect(node.connection.id);
    }
    const columns = await connectionManager.getDriver(node.connection.type).getColumns(node.connection.id, node.table.schema, node.table.name);
    return `${qualifiedName(node.table.schema, node.table.name)}
${columns.map((column) => `${column.name} ${column.dataType}${column.nullable ? "" : " not null"}`).join("\n")}`;
  }
  if (node instanceof ColumnNode) {
    return `${qualifiedName(node.column.schema, node.column.table)}.${quoteIdentifier(node.column.name)}
${node.column.dataType}${node.column.nullable ? "" : " not null"}`;
  }
  return qualifiedObjectName(node);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
