import test from 'node:test'
import assert from 'node:assert/strict'
import { parseNet, ipInList, cleanAccess, isLocalIp } from '../server/access.js'

test('ipInList: подсеть /24', () => {
  assert.equal(ipInList('192.168.1.40', ['192.168.1.0/24']), true)
  assert.equal(ipInList('192.168.2.40', ['192.168.1.0/24']), false)
})

test('ipInList: один адрес и /32', () => {
  assert.equal(ipInList('192.168.1.25', ['192.168.1.25']), true)
  assert.equal(ipInList('192.168.1.26', ['192.168.1.25']), false)
  assert.equal(ipInList('10.0.0.5', ['10.0.0.5/32']), true)
  assert.equal(ipInList('10.0.0.6', ['10.0.0.5/32']), false)
})

test('ipInList: /16, /8 и /0', () => {
  assert.equal(ipInList('172.16.200.3', ['172.16.0.0/16']), true)
  assert.equal(ipInList('172.17.0.1', ['172.16.0.0/16']), false)
  assert.equal(ipInList('10.250.1.1', ['10.0.0.0/8']), true)
  assert.equal(ipInList('8.8.8.8', ['0.0.0.0/0']), true)
})

test('ipInList: ::ffff: снимается, IPv6 — только ::1', () => {
  assert.equal(ipInList('::ffff:192.168.1.40', ['192.168.1.0/24']), true)
  assert.equal(ipInList('::1', ['::1']), true)
  assert.equal(ipInList('fe80::1', ['192.168.1.0/24']), false)
  assert.equal(ipInList('fe80::1', ['::1']), false)
})

test('ipInList: мусор в списке и в адресе не ломает', () => {
  assert.equal(ipInList('192.168.1.40', ['мусор', '', null, '1.2.3', '192.168.1.0/33', '192.168.1.0/24/1', '192.168.1.0/24']), true)
  assert.equal(ipInList('192.168.1.40', ['мусор', '300.1.1.1', '192.168.1.0/ab']), false)
  assert.equal(ipInList('мусор', ['192.168.1.0/24']), false)
  assert.equal(ipInList('192.168.1.40', null), false)
})

test('parseNet: границы', () => {
  assert.equal(parseNet('256.1.1.1'), null)
  assert.equal(parseNet('1.1.1.1/-1'), null)
  assert.ok(parseNet(' 10.0.0.0/8 '))
})

test('cleanAccess: лишнее выбрасывается, неверный адрес — ошибка', () => {
  assert.deepEqual(cleanAccess({ on: 1, allow: [{ net: ' 10.0.0.0/8 ', note: 'Учительская' }, { net: '' }] }), { on: true, allow: [{ net: '10.0.0.0/8', note: 'Учительская' }] })
  assert.ok(cleanAccess({ on: true, allow: [{ net: 'abc' }] }).error)
  assert.ok(cleanAccess({ on: true, allow: Array.from({ length: 51 }, () => ({ net: '10.0.0.1' })) }).error)
})

test('isLocalIp', () => {
  assert.ok(isLocalIp('127.0.0.1') && isLocalIp('::1'))
  assert.ok(!isLocalIp('192.168.1.1'))
})
