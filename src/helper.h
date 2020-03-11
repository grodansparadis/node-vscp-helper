// canalif.cpp
//
// This file is part of the VSCP (http://www.vscp.org)
//
// The MIT License (MIT)
//
// Copyright © 2000-2020 Ake Hedman, Grodans Paradis AB
// <info@grodansparadis.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//

/*
    float2memstr
    memstr2float
*/

#include <napi.h>

namespace vscphelper {

    std::string hello();

    /*!
        Convert a byte buffer of eight bytes to
        a double precision floating point value.
        @param buf Pointer to an buffer of bytes with eight
                    bytes.
        @return Result converted from the eight bytes stored in
                  buffer.
    */
    double mem2double(uint8_t *buf);

    /*!
        Convert a double precision floating point value to eight 
        bytes in a buffer.

        @param value Double precision floating point value to convert.
        @param buf Pointer to buffer where result should be stored.
        @param size Size of buffer. Must be >= eight bytes.
        @return Pointer to buf on success, NULL otherwise.
    */
    uint8_t * double2mem(double value, uint8_t *buf, size_t size);

    /*!
        Convert four bytes in a buffer to a floating point single 
        precision value.
        
        @param buf Pointer to buffer holding bytes to be converted.
        @return Return a single precision floating point value.
    */
    float mem2float(uint8_t *buf);

    /*!
        Convert a floating point single precision value to four bytes 
        in a buffer.

        @param value Single floating point value to convert.
        @param buf Pointer to buffer where result should be stored.
        @param size Size of buffer. Must be >= four bytes.
        @return Pointer to buf on success, NULL otherwise.
    */
    uint8_t * float2mem(float value, uint8_t *buf, size_t size);

    /*!
        Convert 8/16/24/32/40/48/56/64 bit signed integer to double

        @param buf Pointer to memory buffer
        @param size Size of memory buffer (1/2/3/4/5/6/7/8)
        @return Double created from buffer
    */
    double memint2double(uint8_t *buf, size_t size);

    /*!
        Convert 8/16/24/32/40/48/56/64 bit unsigned integer to double

        @param buf Pointer to memory buffer
        @param size Size of memory buffer (1/2/3/4/5/6/7/8)
        @return Double created from buffer
    */
    double memuint2double(uint8_t *buf, size_t size);

    // ------------------------------------------------------------------------

    Napi::Number convertMem2Double(const Napi::CallbackInfo& info);
    Napi::Array convertDouble2Mem(const Napi::CallbackInfo& info);
    
    Napi::Number convertMem2Single(const Napi::CallbackInfo& info);
    Napi::Array convertSingle2Mem(const Napi::CallbackInfo& info);
    
    Napi::Number convertMemUInt2Double(const Napi::CallbackInfo& info);
    Napi::Number convertMemInt2Double(const Napi::CallbackInfo& info);

    Napi::String HelloWrapped(const Napi::CallbackInfo &info);
    Napi::Object Init(Napi::Env env, Napi::Object exports);
} // namespace vscphelper