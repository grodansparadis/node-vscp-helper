#include <stddef.h>
#include <stdio.h>
#include <vscp.h>
#include <canal.h>

#define SIZE(type) printf(#type " size %zu\n", sizeof(type))
#define FIELD(type, field) printf(#type " " #field " %zu\n", offsetof(type, field))

int main(void)
{
    SIZE(vscpEvent);
    FIELD(vscpEvent, head);
    FIELD(vscpEvent, obid);
    FIELD(vscpEvent, year);
    FIELD(vscpEvent, month);
    FIELD(vscpEvent, timestamp_ns);
    FIELD(vscpEvent, vscp_class);
    FIELD(vscpEvent, vscp_type);
    FIELD(vscpEvent, GUID);
    FIELD(vscpEvent, sizeData);
    FIELD(vscpEvent, pdata);
    FIELD(vscpEvent, crc);

    SIZE(vscpEventEx);
    FIELD(vscpEventEx, head);
    FIELD(vscpEventEx, obid);
    FIELD(vscpEventEx, year);
    FIELD(vscpEventEx, month);
    FIELD(vscpEventEx, timestamp_ns);
    FIELD(vscpEventEx, crc);
    FIELD(vscpEventEx, vscp_class);
    FIELD(vscpEventEx, vscp_type);
    FIELD(vscpEventEx, GUID);
    FIELD(vscpEventEx, sizeData);
    FIELD(vscpEventEx, data);

    SIZE(vscpEventFilter);
    FIELD(vscpEventFilter, filter_priority);
    FIELD(vscpEventFilter, mask_priority);
    FIELD(vscpEventFilter, filter_class);
    FIELD(vscpEventFilter, mask_class);
    FIELD(vscpEventFilter, filter_type);
    FIELD(vscpEventFilter, mask_type);
    FIELD(vscpEventFilter, filter_GUID);
    FIELD(vscpEventFilter, mask_GUID);

    SIZE(VSCPStatistics);
    FIELD(VSCPStatistics, cntReceiveFrames);
    FIELD(VSCPStatistics, cntTransmitFrames);
    FIELD(VSCPStatistics, cntReceiveData);
    FIELD(VSCPStatistics, cntTransmitData);
    FIELD(VSCPStatistics, cntOverruns);
    FIELD(VSCPStatistics, x);
    FIELD(VSCPStatistics, y);
    FIELD(VSCPStatistics, z);

    SIZE(VSCPStatus);
    FIELD(VSCPStatus, channel_status);
    FIELD(VSCPStatus, lasterrorcode);
    FIELD(VSCPStatus, lasterrorsubcode);
    FIELD(VSCPStatus, lasterrorstr);

    SIZE(canalMsg);
    FIELD(canalMsg, flags);
    FIELD(canalMsg, obid);
    FIELD(canalMsg, id);
    FIELD(canalMsg, sizeData);
    FIELD(canalMsg, data);
    FIELD(canalMsg, timestamp);
    return 0;
}
