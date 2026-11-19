'use strict';

const koffi = require('koffi');

const EventDateTime = koffi.struct('VscpHelperEventDateTime', {
  day: 'uint8_t',
  hour: 'uint8_t',
  minute: 'uint8_t',
  second: 'uint8_t',
  timestamp: 'uint32_t'
});
const EventTime = koffi.union('VscpHelperEventTime', {
  timestamp_ns: 'uint64_t',
  datetime: EventDateTime
});
const Event = koffi.struct('VscpHelperEvent', {
  head: 'uint16_t',
  obid: 'uint32_t',
  year: 'uint16_t',
  month: 'uint8_t',
  time: EventTime,
  vscp_class: 'uint16_t',
  vscp_type: 'uint16_t',
  GUID: koffi.array('uint8_t', 16),
  sizeData: 'uint16_t',
  pdata: 'void *',
  crc: 'uint16_t'
});
const EventEx = koffi.struct('VscpHelperEventEx', {
  head: 'uint16_t',
  obid: 'uint32_t',
  year: 'uint16_t',
  month: 'uint8_t',
  time: EventTime,
  crc: 'uint16_t',
  vscp_class: 'uint16_t',
  vscp_type: 'uint16_t',
  GUID: koffi.array('uint8_t', 16),
  sizeData: 'uint16_t',
  data: koffi.array('uint8_t', 512)
});
const EventFilter = koffi.struct('VscpHelperEventFilter', {
  filter_priority: 'uint8_t',
  mask_priority: 'uint8_t',
  filter_class: 'uint16_t',
  mask_class: 'uint16_t',
  filter_type: 'uint16_t',
  mask_type: 'uint16_t',
  filter_GUID: koffi.array('uint8_t', 16),
  mask_GUID: koffi.array('uint8_t', 16)
});
const Statistics = koffi.struct('VscpHelperStatistics', {
  cntReceiveFrames: 'unsigned long',
  cntTransmitFrames: 'unsigned long',
  cntReceiveData: 'unsigned long',
  cntTransmitData: 'unsigned long',
  cntOverruns: 'unsigned long',
  x: 'unsigned long',
  y: 'unsigned long',
  z: 'unsigned long'
});
const Status = koffi.struct('VscpHelperStatus', {
  channel_status: 'unsigned long',
  lasterrorcode: 'unsigned long',
  lasterrorsubcode: 'unsigned long',
  lasterrorstr: koffi.array('char', 80)
});
const CanalMsg = koffi.struct('VscpHelperCanalMsg', {
  flags: 'unsigned long',
  obid: 'unsigned long',
  id: 'unsigned long',
  sizeData: 'uint8_t',
  data: koffi.array('uint8_t', 8),
  timestamp: 'unsigned long'
});

module.exports = { Event, EventEx, EventFilter, Statistics, Status, CanalMsg };
