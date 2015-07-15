chrome.runtime.sendMessage({asana:true,token:location.hash}, function(response) {
  	console.log(response);
  	//window.location.replace(response.redirect);
});