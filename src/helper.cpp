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

#define _POSIX

#include "helper.h"

#include <algorithm>
#include <string>

std::string
vscphelper::hello()
{
    return "Hello World";
}

///////////////////////////////////////////////////////////////////////////////
// mem2double
//

double
vscphelper::mem2double(uint8_t* buf)
{
    if ( nullptr == buf) {
        return 0;
    }

    return *((double *)buf);
}

///////////////////////////////////////////////////////////////////////////////
// double2mem
//

uint8_t *
double2mem(double value, uint8_t* buf, size_t size)
{
    if ( nullptr == buf) {
        return NULL;
    }

    if ( size < 8 ) {
        return NULL;
    }

    uint8_t *p = (uint8_t *)&value;
    memcpy(buf,p,8);

    return buf;
}

///////////////////////////////////////////////////////////////////////////////
// mem2float
//

float
mem2float(uint8_t* buf)
{
    if ( nullptr == buf) {
        return 0;
    }

    return *((float *)buf);
}

///////////////////////////////////////////////////////////////////////////////
// float2mem
//

uint8_t *
float2mem(float value, uint8_t* buf, size_t size)
{
    if ( nullptr == buf) {
        return NULL;
    }

    if ( size < 4 ) {
        return NULL;
    }

    uint8_t *p = (uint8_t *)&value;
    memcpy(buf,p,4);

    return buf;
}

///////////////////////////////////////////////////////////////////////////////
// memint2double
//

double memint2double(uint8_t *buf, size_t size)
{
    bool bNegative = false;
    uint8_t wrkbuf[8];

    if ( nullptr == buf ) {
        return 0;
    }

    if ( (0 == size) || (size > 8) ) {
        return 0;
    }

    memset(wrkbuf, 0, sizeof(wrkbuf));

    // Check if sign bit is set
    if ( *buf & 0x80) {
        bNegative = true;
        *buf |= 0x7f;   // Reset sign bit
    }

    memcpy( wrkbuf + (8-size), buf, size);

    if ( bNegative ) {
        wrkbuf[0] |= 0x80; // Set sign bit
    }

    return (double)((int64_t)*wrkbuf);
}

///////////////////////////////////////////////////////////////////////////////
// memuint2double
//

double memuint2double(uint8_t *buf, size_t size)
{
    uint8_t wrkbuf[8];

    if ( nullptr == buf ) {
        return 0;
    }

    if ( (0 == size) || (size > 8) ) {
        return 0;
    }

    memset(wrkbuf, 0, sizeof(wrkbuf));

    memcpy( wrkbuf + (8-size), buf, size);

    return (double)((uint64_t)*wrkbuf);
}

///////////////////////////////////////////////////////////////////////////////
// convertMem2Double
//

Napi::Number
vscphelper::convertMem2Double(const Napi::CallbackInfo& info)
{
    uint8_t buf[8];
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray() ) {
        Napi::TypeError::New(env, "Array expected")
          .ThrowAsJavaScriptException();
    }

    // Get buffer
    Napi::Array arr  = info[0].As<Napi::Array>();
   
    memset(buf,0,sizeof(buf));

    for ( unsigned int i=0; i<std::min((uint8_t)arr.Length(),(uint8_t)8); i++ ) {
        Napi::Value val = arr[i];
        if (val.IsNumber()) {
            buf[i] = (int)val.As<Napi::Number>();
        }
    }

    Napi::Number returnValue = Napi::Number::New(env, vscphelper::mem2double(buf));

    return returnValue;
}

///////////////////////////////////////////////////////////////////////////////
// convertDouble2Mem
//

Napi::Array
vscphelper::convertDouble2Mem(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber() ) {
        Napi::TypeError::New(env, "Number expected")
          .ThrowAsJavaScriptException();
    }

    Napi::Number value  = info[0].As<Napi::Number>();
   
    uint8_t buf[8];
    memset(buf,0,sizeof(buf));
    
    if ( nullptr == vscphelper::double2mem(value,buf,sizeof(buf)) ) {
        Napi::TypeError::New(env, "Conversion of double to memory failed")
          .ThrowAsJavaScriptException();
    }

    Napi::Array returnValue = Napi::Array::New(env,8);
    for ( int i=0; i<8; i++ ) {
        returnValue[uint8_t(i)] = Napi::Number::New(env,buf[i]);
    }
    
    return returnValue;
}

///////////////////////////////////////////////////////////////////////////////
// convertMem2Single
//

Napi::Number
vscphelper::convertMem2Single(const Napi::CallbackInfo& info)
{
    uint8_t buf[8];
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray() ) {
        Napi::TypeError::New(env, "Array expected")
          .ThrowAsJavaScriptException();
    }

    // Get buffer
    Napi::Array arr  = info[0].As<Napi::Array>();
   
    memset(buf,0,sizeof(buf));

    for ( unsigned int i=0; i<std::min((uint8_t)arr.Length(),(uint8_t)4); i++ ) {
        Napi::Value val = arr[i];
        if (val.IsNumber()) {
            buf[i] = (int)val.As<Napi::Number>();
        }
    }

    Napi::Number returnValue = Napi::Number::New(env, vscphelper::mem2float(buf));

    return returnValue;
}

///////////////////////////////////////////////////////////////////////////////
// convertSingle2Mem
//

Napi::Array
vscphelper::convertSingle2Mem(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber() ) {
        Napi::TypeError::New(env, "Number expected")
          .ThrowAsJavaScriptException();
    }

    Napi::Number value  = info[0].As<Napi::Number>();
   
    uint8_t buf[4];
    memset(buf,0,sizeof(buf));
    
    if ( nullptr == vscphelper::float2mem(value,buf,sizeof(buf)) ) {
        Napi::TypeError::New(env, "Conversion of float to memory failed")
          .ThrowAsJavaScriptException();
    }

    Napi::Array returnValue = Napi::Array::New(env,4);
    for ( int i=0; i<4; i++ ) {
        returnValue[uint8_t(i)] = Napi::Number::New(env,buf[i]);
    }
    
    return returnValue;
}

///////////////////////////////////////////////////////////////////////////////
// convertMemUInt2Double
//

Napi::Number 
vscphelper::convertMemUInt2Double(const Napi::CallbackInfo& info)
{
    uint8_t buf[8];
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray() ) {
        Napi::TypeError::New(env, "Two arguments expected. Array and size expected")
          .ThrowAsJavaScriptException();
    }

    // Get buffer
    Napi::Array arr  = info[0].As<Napi::Array>();
   
    memset(buf,0,sizeof(buf));

    uint8_t len = std::min((uint8_t)arr.Length(),(uint8_t)8);
    for ( unsigned int i=0; i<len; i++ ) {
        Napi::Value val = arr[i];
        if (val.IsNumber()) {
            buf[i] = (int)val.As<Napi::Number>();
        }
    }

    Napi::Number returnValue = Napi::Number::New(env, vscphelper::memuint2double(buf,len));

    return returnValue;
}

///////////////////////////////////////////////////////////////////////////////
// convertMemInt2Double
//

Napi::Number 
vscphelper::convertMemInt2Double(const Napi::CallbackInfo& info)
{
    uint8_t buf[8];
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray() ) {
        Napi::TypeError::New(env, "Two arguments expected. Array and size expected")
          .ThrowAsJavaScriptException();
    }

    // Get buffer
    Napi::Array arr  = info[0].As<Napi::Array>();
   
    memset(buf,0,sizeof(buf));

    uint8_t len = std::min((uint8_t)arr.Length(),(uint8_t)8);
    for ( unsigned int i=0; i<len; i++ ) {
        Napi::Value val = arr[i];
        if (val.IsNumber()) {
            buf[i] = (int)val.As<Napi::Number>();
        }
    }

    Napi::Number returnValue = Napi::Number::New(env, vscphelper::memint2double(buf,len));

    return returnValue;
}

///////////////////////////////////////////////////////////////////////////////
// HelloWrapped
//

Napi::String
vscphelper::HelloWrapped(const Napi::CallbackInfo& info)
{
    Napi::Env env            = info.Env();
    Napi::String returnValue = Napi::String::New(env, vscphelper::hello());

    return returnValue;
}

///////////////////////////////////////////////////////////////////////////////
// float2mem
//

Napi::Object
vscphelper::Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("hello", Napi::Function::New(env, vscphelper::HelloWrapped));

    return exports;
}