/*=====================================
=            browserAction            =
=====================================*/
/*var indexUrl=chrome.extension.getURL("index.html");
chrome.browserAction.onClicked.addListener(function(){
	chrome.tabs.create({
		url:indexUrl
	})
});*/
/*==================================
=            Asana AUTH            =
==================================*/
function ASANA_AUTH(callback){
	chrome.cookies.get({
      url: options.APIURL,
      name: 'ticket'
    }, function(cookie) {
    	if (!cookie) {
        	callback({
        		loggedIn:false,
        		message: "Not Authorized"
        	});
    	}else{
    		callback({
        		loggedIn:true
        	});
    	}
    });
}

/*=============================================
=            Request to Asana APIs            =
=============================================*/
function ASANA_API(method,path,args,callback){
	/*============================
	=            Init            =
	============================*/
	var requestUrl=options.APIURL+path;
	var manifest = chrome.runtime.getManifest();
	var client_name = [
		"chrome-extension",
		chrome.i18n.getMessage("@@extension_id"),
		manifest.version,
		manifest.name
    ].join(":");
	/*=======================================
	=            Url processing             =
	=======================================*/
	if (method === "GET" || method === "DELETE") {
		requestUrl += "?" + $.param(args);
    }
    /*====================================
    =            Request Body            =
    ====================================*/
    var requestBody={
		type: method,
        url: requestUrl,
        timeout: 30000,   // 30 second timeout
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "X-Allow-Asana-Client": "1"
        },
        accept: "application/json",
        xhrFields: {
          withCredentials: true
        },
        success: function(data, status, xhr) {
	        callback(data);
        },
        error: function(xhr, status, error) {
	        if (status === "error" && xhr.responseText) {
	            var response;
	            try {
	              response = $.parseJSON(xhr.responseText);
	            } catch (e) {
	            	response = {
	                	errors: [{message: "Could not parse response from server" }]
	              	};
	            }
	            callback(response);
	        } else {
	            callback({ errors: [{message: error || status }]});
	        }
        }
	}
	/*=======================================
	=            Data processing            =
	=======================================*/
	if (method === "PUT" || method === "POST") {
		requestBody.dataType = "json";
		requestBody.contentType = "application/json";
		requestBody.processData = false;
		requestBody.data = JSON.stringify({
			data:args,
			options: {client_name:client_name}
		});
    }		
	/*====================================
	=            Send Request            =
	====================================*/
	$.ajax(requestBody);
}
/*========================================
=            Extension Server            =
========================================*/
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if(request.target==="asanaAPI") {
        ASANA_API(request.method,request.path,request.args,sendResponse);
        return true;
    }
    if(request.type==="auth"){
    	ASANA_AUTH(sendResponse);
    	return true;
    }
});
