/*=======================================
=            Asana Extension            =
=======================================*/
var asanaExt=angular.module("asanaExt",[]);
/*========================================
=            Asana Directives            =
========================================*/
asanaExt.directive("ngBlur",function(){
	return{
		restrict:'A',
		link:function(scope,elem,attrs){
			elem.bind("blur",function(){
				scope.$apply(attrs.ngBlur);
			});
		}
	}
});
asanaExt.directive("groupe",function(){
	return{
		restrict:'C',
		templateUrl:'groupe.html',
		scope:{
			options:"=",
			complete:"&",
			delete:"&",
			edit:"&",
			tasks:"="
		},
		link:function(scope,elem,attrs){
			
		}
	}
});
asanaExt.directive("selector",function(){
	return{
		restrict:"C",
		templateUrl:"selector.html",
		scope:{
			list:"=",
			key:"@",
			selected:"&",
			label:"@",
			default:"="
		},
		link:function(scope,elem,attrs){
			var $elem=jQuery(elem);
			var $list=$elem.find(".selector_list");
			$elem.siblings().click(function(){
				scope.showList('hide');
			})

			scope.selectedItem=false;
			scope.$watch("list",function(){
				if(scope.list && !scope.selectedItem){
					scope.select(scope.list[0]);
					scope.setDefault();
					scope.$watch("default",function(){
						scope.setDefault();
					},true);
				}
			},true);

			scope.select=function(item){
				scope.selectedItem=item;
				scope.selected({item:item});
			}

			scope.showList=function(action){
				if(action=='show')
					$list.addClass("active");
				if(action=='hide')
					$list.removeClass("active");
				if(action=='toggle')
					$list.toggleClass("active");
			}

			scope.setDefault=function(){
				for(k in scope.default){
					if(scope.default[k]!=undefined){
						for (var i = 0; i < scope.list.length; i++) {
							if(scope.list[i][k]==scope.default[k]){
								scope.select(scope.list[i]);
							}
						};
					}
				}
			}
		}
	}
});
/*=====================================
=            Asana filters            =
=====================================*/
asanaExt.filter("groupe",function(){
	return function(tasks,options){
		var filtered={};
		angular.forEach(tasks,function(task,t){
			if(task.assignee_status==options.status && !task.completed){
				if(task.name.charAt(task.name.length-1)==":"){
					task.color=options.color;
				}
				filtered[t]=task;
			}		
		});
		return filtered;
	}
});
/*==========================================
=            Asana Main Service            =
==========================================*/
asanaExt.factory("asana",function($rootScope,$window){
	$rootScope.safeApply = function(fn) {
        var phase = this.$root.$$phase;
        if(phase == '$apply' || phase == '$digest') {
          if(fn && (typeof(fn) === 'function')) {
            fn();
          }
        } else {
          this.$apply(fn);
        }
    };
	var asana={
		cache:true,
		clone:function(source){
			return JSON.parse(JSON.stringify(source));
		},
		config:function(callback){
			$rootScope.safeApply(function(){
				callback({
					logoutURL:asana.options.logoutURL,
					loginURL:asana.options.loginURL,
					signupURL:asana.options.signupURL
				});
			});
		},
		currentUser:{},
		isLoggedIn:function(success,error,retry){
			chrome.runtime.sendMessage({type:"auth"},function(auth){
				if(auth.loggedIn){
					$rootScope.safeApply(function(){
						success(auth.loggedIn);
					});
				}else{
					$rootScope.safeApply(function(){
						error(auth.loggedIn);
						if(retry){
							setTimeout(function(){
								asana.isLoggedIn(success,error,true);
							},asana.options.retry*1000);
						}
					});
				}
			});
		},
		me:function(callback){
			//Check localStorage
			var local=asana.storage.get("me");
			if(local!=null && asana.cache){
				asana.user(local);
				callback(local);
			}
			asana.request("GET","/users/me",{},function(me){
				if(me.data.photo!=null){
					me.data.picture=me.data.photo.image_128x128;
				}else{
					me.data.picture="img/avatar.png";
				}
				asana.storage.set("me",me.data);
				$rootScope.safeApply(function(){
					asana.user(me.data);
					callback(me.data);
				});
			})
		},
		notify:function(notification){
			$rootScope.safeApply(function(){
				asana.notifications_callback(notification);
			});
		},
		notifications:function(callback){
			asana.notifications_callback=callback;
		},
		options:$window.options,
		request:function(method,path,args,callback){
			asana.isLoggedIn(function(){
				chrome.runtime.sendMessage({
					target:"asanaAPI",
					method:method,
					path:path,
					args:args
				},
				callback);
			},function(){
				asana.notify({
					error:1,
					loggedIn:false,
					msg:"Not Authorized"
				})
				//callback()
			});
		},
		storage:{
			get:function(key){
				var value=false;
				try {
	            	value = JSON.parse(localStorage.getItem(key));
	            } catch (e) {
	            	value = null;
	            }
				return value;
			},
			set:function(key,val){
				localStorage.setItem(key,JSON.stringify(val));
			}
		},
		tasks:{
			get:function(callback,tasks){
				var w=0;
				if(tasks!=undefined){
					w=tasks.length;
				}else{
					tasks=[];
				}

				//Check localStorage
				var local=asana.storage.get("tasks");
				if(local!=null && asana.cache && w==0){
					callback(local);
				}

				var currentUser=asana.currentUser;

				if(w<currentUser.workspaces.length){
					asana.request("GET","/tasks",{workspace:currentUser.workspaces[w],assignee:currentUser.id,opt_fields:"id,name,notes,completed,assignee_status,memberships"},function(workspaceTasks){
						tasks.push(workspaceTasks.data);
						asana.tasks.get(callback,tasks);
					});
				}else{
					var concatTasks=[];
					for (var t = 0; t < tasks.length; t++) {
						concatTasks=concatTasks.concat(tasks[t]);
					};
					asana.storage.set("tasks",concatTasks);
					if(!asana.update_callback)
						asana.update_callback=callback;
					$rootScope.safeApply(function(){
						callback(concatTasks);
					});
				}
			},
			create:function(task,callback){
				task=asana.clone(task);
				var workspace=task.workspace;
				delete task["workspace"];
				asana.request("POST","/workspaces/"+workspace+"/tasks",task,function(response){
					$rootScope.safeApply(function(){
						if(response.data.created_at!==undefined){
							asana.notify({
								error:0,
								msg:"task added"
							});
						}else{
							asana.notify({
								error:1
							});
						}
						//Update Local Version
						asana.update();
						callback(response.data);
					});
				})
			},
			delete:function(task,callback){
				asana.request("DELETE","/tasks/"+task.id,{},function(response){
					$rootScope.safeApply(function(){
						if(response.data!==undefined){
							asana.notify({
								error:0,
								msg:"task removed"
							});
						}else{
							asana.notify({
								error:1
							});
						}
						//Update Local Version
						asana.update();
						callback(response.data);
					});
				});
			},
			update:function(task,callback){
				var update_fields=["completed","name"];
				var updatedTask={};
				for(var f in update_fields){
					updatedTask[update_fields[f]]=task[update_fields[f]];
				}
				asana.request("PUT","/tasks/"+task.id,updatedTask,function(response){
					if(response.data!==undefined){
						asana.notify({
							error:0,
							msg:"task updated"
						});
					}else{
						asana.notify({
							error:1,
							msg:"try again"
						});
					}
					//Update Local Version
					asana.update();
					callback(response.data);
				});
			}
		},
		update:function(callback){
			asana.cache=false;
			asana.tasks.get(function(tasks){
				$rootScope.safeApply(function(){
					asana.update_callback(tasks);
				});
			});
		},
		update_callback:false,
		user:function(user){
			asana.currentUser=asana.clone(user);
			var workspaces=[];
			for (var w = 0; w < user.workspaces.length; w++) {
				workspaces.push(user.workspaces[w].id);
			};
			asana.currentUser.workspaces=workspaces;
		},
		users:function(callback){
			//Check localStorage
			var local=asana.storage.get("users");
			if(local!=null && asana.cache){
				callback(local);
			}
			asana.request("GET","/users",{},function(users){
				$rootScope.safeApply(function(){
					asana.storage.set("users",users.data);
					callback(users.data);
				});
			});
		}
	}
	return asana;
});
/*=============================================
=            Asana Main Controller            =
=============================================*/
asanaExt.controller("asanaExtCtrl",function($scope,$window,asana){
	
	$scope.newTask={
		name:"",
		notes:""
	};
	$scope.show={};
	$scope.currentUser=false;
	//Géneral configuration
	asana.config(function(config){
		$scope.config=config;
	});
	

	asana.isLoggedIn(function(loggedIn){
		$scope.show("app");
		//Populate me
		asana.me(function(me){
			$scope.currentUser=me;
			//Populate workspaces
			$scope.workspaces=me.workspaces;
			$scope.newTask.workspace=me.workspaces[0].id;
		});
		$scope.$watch("currentUser",function(newVal,oldVal){
			if(!$scope.currentUser){
				return false;
			}
			//Populate my tasks
			asana.tasks.get(function(mytasks){
				$scope.currentUserTasks=mytasks;
			});
		});
		//Populate users
		asana.users(function(users){
			$scope.users=users;
		});
	},function(loggedIn){
		$scope.show("login");
	},true);
	/*==================================
	=            Add a Task            =
	==================================*/
	$scope.addTask=function(){
		if ($scope.newTask.name=="" || $scope.newTask.notes=="") {
			asana.notify({
				msg:"fill the fields before adding the task"
			});
			$window.inputValidation();
			return false;
		};
		asana.tasks.create($scope.newTask,function(response){
			if($scope.newTask.assignee==$scope.currentUser.id){
				$scope.currentUserTasks.push(asana.clone($scope.newTask));
			}
			$scope.newTask.name="";
			$scope.newTask.notes="";
		});
	}
	/*===================================
	=            Edit a task            =
	===================================*/
	$scope.editTask=function(task){
		task.editing=false;
		asana.tasks.update(task,function(response){});
	}
	/*=====================================
	=            Delete a task            =
	=====================================*/
	$scope.deleteTask=function(task){
		asana.tasks.delete(task,function(){
			for (var t = 0; t < $scope.currentUserTasks.length; t++) {
				if($scope.currentUserTasks[t].id==task.id){
					delete $scope.currentUserTasks[t];
				}
			};
		});
	}		
	/*==============================================
	=            Saving completed tasks            =
	==============================================*/
	$scope.completeTask=function(task){
		asana.tasks.update(task,function(response){});
	}
	/*========================================
	=            Toggle login/app            =
	========================================*/
	$scope.show=function(panel){
		if(panel=="app"){
			$scope.show.app=true;
			$scope.show.login=false;
		}else{
			$scope.show.app=false;
			$scope.show.login=true;
		}
	}
	/*===========================================
	=            Listen for selector            =
	===========================================*/
	$scope.selectedUser=function(user){
		$scope.newTask.assignee=user.id;
	}
	$scope.selectedWorkspace=function(workspace){
		$scope.newTask.workspace=workspace.id;
	}		
	$scope.selectedPriority=function(priority){
		$scope.newTask.assignee_status=priority.priority.toLowerCase();
	}

	/*=====================================
	=            Notifications            =
	=====================================*/
	asana.notifications(function(notification){
		var $notif=jQuery(".notification");
		$scope.notification=notification.msg;
		$notif.removeClass("active").addClass("active");
		setTimeout(function(){
			$notif.removeClass("active");
		},3000);
		if(notification.loggedIn==false){
			$scope.show("login");
			asana.isLoggedIn(function(){
				asana.update();
				$scope.show("app");
			},function(){
				$scope.show("login");
			},true);
		}
	});
});
/*==================================
=            Maaaggiicc            =
==================================*/
jQuery(document).ready(function(){
	(function($){
		/*=============================================
		=            Current User controls            =
		=============================================*/
		var $currentUserPanel=$("#currentUser");
		var $currentUserControls=$("#controls");
		$currentUserPanel.click(function(){
			$currentUserControls.show();
		});

		$('*').click(function(e) {
	    	if(e.target.id != 'currentUserName') {
	    		$currentUserControls.hide();
	    	}
	    });	    
	})(jQuery);
});


/*========================================
=            Validation error            =
========================================*/
function inputValidation(){
	var $inputs=jQuery(".inputs");
	$inputs.removeClass("error").addClass("error");
	setTimeout(function(){
		$inputs.removeClass("error");
	},2000);
}
/*=================================================
=            Add task is it visible :)            =
=================================================*/
jQuery(document).ready(function(){
	(function($){
		var $form = $("#createANewTask");
	    var $window = $(window);
	    var $link = $("#createTaskLink");

	    setTimeout(function(){
	    	if(isElementVisible($window,$form))
		   	$link.hide();
	    },500);
	    jQuery("#currentUserTasks").scroll(function(){
	    	var isVisible=isElementVisible($window,$form);
		    if(isVisible)
		    	$link.hide();
		    else
		    	$link.show();
	    })
	})(jQuery);
})
function isElementVisible($window,$elem){
	var docViewTop = $window.scrollTop();
    var docViewBottom = docViewTop + $window.height();

    var elemTop = $elem.offset().top;
    var elemBottom = elemTop + $elem.height();

    return ((elemBottom <= docViewBottom) && (elemTop >= docViewTop));
}

/*==========================================
=            Google font loader            =
==========================================*/
var WebFontConfig = {
  google: {
    families: ['Open Sans']
  },
  active: function() {
  	setTimeout(function(){
  		jQuery("#loading").fadeOut();
  	},500);
  }
};

(function() {
  var wf = document.createElement('script');
  wf.src = 'font.js';
  wf.type = 'text/javascript';
  wf.async = 'true';
  var s = document.getElementsByTagName('script')[0];
  s.parentNode.insertBefore(wf, s);
})();