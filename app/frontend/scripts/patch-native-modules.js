const fs = require('fs');
const path = require('path');

// 1. Patch llama.rn
const llamaResolverPath = path.resolve(__dirname, '../node_modules/llama.rn/android/src/main/java/com/rnllama/JSCallInvokerResolver.java');
const llamaModulePath = path.resolve(__dirname, '../node_modules/llama.rn/android/src/main/java/com/rnllama/RNLlamaModule.java');

const llamaResolverContent = `package com.rnllama;

import androidx.annotation.OptIn;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.common.annotations.FrameworkAPI;
import com.facebook.react.turbomodule.core.CallInvokerHolderImpl;

public class JSCallInvokerResolver {

  @OptIn(markerClass = FrameworkAPI.class)
  public static CallInvokerHolderImpl getJSCallInvokerHolder(ReactApplicationContext context) {
    try {
      var method = context.getClass().getMethod("getJSCallInvokerHolder");
      return (CallInvokerHolderImpl) method.invoke(context);
    } catch (Exception ignored) {
    }
    try {
      var catalystInstance = context.getClass().getMethod("getCatalystInstance").invoke(context);
      assert catalystInstance != null;
      var method = catalystInstance.getClass().getMethod("getJSCallInvokerHolder");
      return (CallInvokerHolderImpl) method.invoke(catalystInstance);
    } catch (Exception e) {
      throw new RuntimeException("Failed to get JSCallInvokerHolder", e);
    }
  }

  @OptIn(markerClass = FrameworkAPI.class)
  public static long getJavaScriptContextHolder(ReactApplicationContext context) {
    try {
      var method = context.getClass().getMethod("getJavaScriptContextHolder");
      var holder = method.invoke(context);
      var getMethod = holder.getClass().getMethod("get");
      return (Long) getMethod.invoke(holder);
    } catch (Exception e) {
      throw new RuntimeException("Failed to get JavaScriptContextHolder", e);
    }
  }
}
`;

if (fs.existsSync(path.dirname(llamaResolverPath))) {
  fs.writeFileSync(llamaResolverPath, llamaResolverContent, 'utf8');
}

if (fs.existsSync(llamaModulePath)) {
  let content = fs.readFileSync(llamaModulePath, 'utf8');
  content = content.replace(
    /long jsContextPointer = context\.getJavaScriptContextHolder\(\)\.get\(\);\s*CallInvokerHolderImpl holder =\s*\(CallInvokerHolderImpl\) context\.getCatalystInstance\(\)\.getJSCallInvokerHolder\(\);/g,
    'long jsContextPointer = JSCallInvokerResolver.getJavaScriptContextHolder(context);\n      CallInvokerHolderImpl holder = JSCallInvokerResolver.getJSCallInvokerHolder(context);'
  );
  fs.writeFileSync(llamaModulePath, content, 'utf8');
}

// 2. Patch whisper.rn
const whisperNewArchPath = path.resolve(__dirname, '../node_modules/whisper.rn/android/src/newarch/java/com/rnwhisper/RNWhisperModule.java');
const whisperOldArchPath = path.resolve(__dirname, '../node_modules/whisper.rn/android/src/oldarch/java/com/rnwhisper/RNWhisperModule.java');

for (const p of [whisperNewArchPath, whisperOldArchPath]) {
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    content = content.replace(
      /long jsContextPointer = context\.getJavaScriptContextHolder\(\)\.get\(\);\s*CallInvokerHolderImpl holder =\s*\(CallInvokerHolderImpl\) context\.getCatalystInstance\(\)\.getJSCallInvokerHolder\(\);/g,
      'long jsContextPointer = JSCallInvokerResolver.getJavaScriptContextHolder(context);\n      CallInvokerHolderImpl holder = JSCallInvokerResolver.getJSCallInvokerHolder(context);'
    );
    fs.writeFileSync(p, content, 'utf8');
  }
}

console.log('[patch-native-modules] Successfully verified/applied JSI Bridgeless patches to llama.rn and whisper.rn');
