$(document).ready(function()
{
  $message_text_box = $('#inputMessage');
  $refresh_button = $('#refreshButton');
  $send_button = $('#sendButton');
  $send_pm_button = $('#sendPMButton');
  $mainOutput = $('#mainOutput');
  $whoHereOutput = $('#who-here-output');
  var server_responses = ["OK", "BROADCAST FROM", "PRIVATE FROM"];
  var commands = ["ME IS", "BROADCAST", "WHO HERE"];
  var message_sent = "";
  var username = "";
  var users = [];

  if (this.MozWebSocket) WebSocket = MozWebSocket;
  if (!window.WebSocket) alert("WebSocket is NOT available in this (sucky) browser.");

  var url = 'ws://localhost:8787/chat';
  var web_socket = new WebSocket(url);

  web_socket.onopen = function()
  {
    add_message($mainOutput, "Please enter your username in the textbox below.");

    // Start polling for users
    retreive_users();
  }

  web_socket.onmessage = function(e)
  {
    var server_response;
    var web_socket_message = e.data.toString();
    console.log(web_socket_message);
    console.log(message_sent);

    // Determine server_response
    for (var i = 0; i < server_responses.length; ++i)
    {
      if (web_socket_message.lastIndexOf(server_responses[i], 0) === 0)
      {
        server_response = server_responses[i];
      }
    }

    console.log(server_response);

    if (server_response === "OK")
    {
      username = message_sent.split(" ")[2];
      var message = "Identified as " + username;
      $message_text_box.data("messagetype", "BROADCAST");

      add_message($mainOutput, message);
    }
    else if (server_response === "BROADCAST FROM")
    {
      // Figure out the sender
      var split = web_socket_message.split(" ");
      var sender = split[2];

      var message = sender + ": " + split.splice(3, split.length).join(" ");

      add_message($mainOutput, message);
    }
    else if (server_response === "PRIVATE FROM")
    {
      // Figure out the sender
      var lines = web_socket_message.split("\n");
      var message = sender + ": " + lines[1];
      var sender = lines[0].split(" ")[2];

      add_new_pm_tab(sender, message);
    }
    else
    {
      // Assume what we're getting from the server is the list of users
      // currently online

      // Clear out users
      $whoHereOutput.html('');

      // Gather and fill in users
      users.length = 0;
      var message = web_socket_message;

      for (var i = 0; i < message.split(",").length; ++i)
      {
        var tmpUser = $.trim(message.split(",")[i]);
        users.push(tmpUser);
        add_message($whoHereOutput, tmpUser);
      }

      console.log(users);
    }
  }

  web_socket.onclose = function(e)
  {
    add_message($mainOutput, 'Connection closed');
  }

  web_socket.onerror = function(e)
  {
    add_message($mainOutput, 'Error from server');
  }

  $send_button.click(send_to_server);
  $send_pm_button.click(send_to_server);
  $refresh_button.click(refresh_user_list);

  function send_to_server()
  {
    var textarea = $(this).siblings().find('textarea');
    var message_type = textarea.data("messagetype");
    if (message_type.lastIndexOf("SEND", 0) === 0)
    {
      var splitter = "\n";
    }
    else
    {
      var splitter = " ";
    }

    message_sent = textarea.data("messagetype") + splitter + textarea.val();
    console.log(message_sent);
    web_socket.send(message_sent);

    textarea.val("");
  }

  function add_message(display_area, output)
  {
    output = detect_users_in_text(output);
    display_area.append("<div class='message'>" + output + "</div>");
    display_area.find("a").each(function(index, value)
    {
      $(this).click(function()
      {
        console.log("recipient is: " + $(this).html());
        add_new_pm_tab($(this).html(), false);
      });
    });
  }

  function retreive_users()
  {
    refresh_user_list();

    setTimeout(function()
    {
      retreive_users();
    }, 5000);
  }

  function replace_all(find, replace, str)
  {
    return str.replace(new RegExp(find, 'g'), replace);
  }

  function detect_users_in_text(output)
  {
    // For each unique user
    for(var i = 0; i < users.length; ++i)
    {
      var user_link = "<a href='#' class='users" + (i % 16) + "'>" + users[i] + "</a>";

      // Replace user in output with proper a tag
      output = replace_all(users[i], user_link, output);
    }

    return output;
  }

  function refresh_user_list()
  {
    message_sent = $refresh_button.data("messagetype");
    console.log(message_sent);
    web_socket.send(message_sent);
  }

  function add_new_pm_tab(recipient, message)
  {
    // TODO
    // First check if conversation already exists

    // Add a new tab for the private message
    $("<li><a href='#" + recipient + "' tabindex='-1' data-toggle='tab'>" + recipient + "</a></li>")
        .appendTo('#privateMessageTabs');

    // Add a new tab-pane for the private message
    var newPMTab = $($('.privateMessageTemplate').html())
        .attr('id', recipient)
        .appendTo('.tab-content');

    newPMTab.find(".panel-title").html("PM with " + recipient);
    newPMTab.find("textarea").attr("data-messagetype", "SEND " + recipient);

    // Make new private message screen active
    $('#privateMessageTabs a[href="#' + recipient + '"]').tab('show');

    // TODO add a click handler for the Send PM button

    if (message)
    {
      add_message(newPMTab.find(".output"), message);
    }
  }
});
