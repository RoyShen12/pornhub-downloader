module.exports = class LimitedInQueue {
  constructor(capacity) {
    this.capacity = capacity
    this._data = []
  }

  get size() {
    return this._data.length
  }

  get first() {
    return this._data[0]
  }

  get last() {
    return this._data[this.size - 1]
  }

  push(v) {
    if (this.size < this.capacity) {
      this._data.push(v)
    }
    else {
      this._data.forEach((_v, i, d) => d[i] = d[i + 1])
      this._data[this.capacity - 1] = v
    }
  }
}
