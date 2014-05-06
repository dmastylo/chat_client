$(document).ready(function()
{
  $message_text_box = $('#inputMessage');
  $refresh_button = $('#refreshButton');
  $send_button = $('#sendButton');
  $send_pm_button = $('#sendPMButton');
  $mainOutput = $('#mainOutput');
  $whoHereOutput = $('#who-here-output');
  $usernameOutput = $('#username');
  var server_responses = ["OK", "BROADCAST FROM", "PRIVATE FROM"];
  var commands = ["ME IS", "BROADCAST", "WHO HERE"];
  var message_sent = "";
  var username = "";
  var current_users = [];
  var persisted_users = [];

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
      username = message_sent.split(" ")[2].trim();
      var message = "Identified as " + username;
      $message_text_box.data("messagetype", "BROADCAST");

      // Add the username to the navbar at the top right
      add_message($usernameOutput, username);

      // Add the "Identified as ____" message to the main output
      add_message($mainOutput, message);
    }
    else if (server_response === "BROADCAST FROM")
    {
      // Figure out the sender
      var lines = web_socket_message.split("\n");
      var sender = lines[0].split(" ")[2];
      var message = sender + ": " + lines[1];

      add_message($mainOutput, message);
    }
    else if (server_response === "PRIVATE FROM")
    {
      // Figure out the sender
      var lines = web_socket_message.split("\n");
      var sender = lines[0].split(" ")[2];
      var message = sender + ": " + lines[1];

      add_new_pm_tab(sender, message);
    }
    else
    {
      // Assume what we're getting from the server is the list of users
      // currently online

      // Clear out users
      $whoHereOutput.html('');
      current_users.length = 0;

      var message = web_socket_message;

      for (var i = 0; i < message.split(",").length; ++i)
      {
        var tmpUser = $.trim(message.split(",")[i]);
        current_users.push(tmpUser);

        // Add to persisted users if they do not already exist
        if (persisted_users.indexOf(tmpUser) === -1)
        {
          persisted_users.push(tmpUser);
        }

        add_message($whoHereOutput, tmpUser);
      }

      console.log(current_users);
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
    var $textarea = $(this).siblings().find('textarea');
    var message_type = $textarea.data("messagetype");
    var splitter = "\n";

    // The SEND command requires a newline before the actual message
    if (message_type.lastIndexOf("SEND", 0) !== 0 && message_type.lastIndexOf("BROADCAST", 0) !== 0)
    {
      var splitter = " ";
    }
    else if(message_type.lastIndexOf("SEND", 0) === 0)
    {
      // Add the output of the message to the display
      var display_message = username + ": " + $textarea.val();
      add_message($textarea.parents('.panel').find('.output'), display_message);
    }

    message_sent = $textarea.data("messagetype") + splitter + $textarea.val();
    console.log(message_sent);
    web_socket.send(message_sent);

    // Clear the textarea
    $textarea.val("");
  }

  function add_message(display_area, output)
  {
    output = detect_users_in_text(output);
    display_area.append("<div class='message'>" + output + "</div>");

    // Add click handlers on the usernames that were found in the chat message
    display_area.find("a").each(function(index, value)
    {
      var $this = $(this);
      $this.click(function()
      {
        console.log("recipient is: " + $this.html());
        add_new_pm_tab($this.html(), false);
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
    return str.replace(new RegExp("^" + find + "$", 'g'), replace);
  }

  function detect_users_in_text(output)
  {
    // For each unique user
    for(var i = 0; i < persisted_users.length; ++i)
    {
      // Check that the user is currently logged in
      if (current_users.indexOf(persisted_users[i]) !== -1)
      {
        var user_link = "<a href='#' class='users" + (i % 16) + "'>" + persisted_users[i] + "</a>";

        // Replace user in output with proper a tag
        output = replace_all(persisted_users[i], user_link, output);
      }
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
    // Make sure you can't PM yourself
    if (recipient != username)
    {
      // Check if conversation already exists
      if ($('#' + recipient).length)
      {
        var PMTab = $('#' + recipient);
        $('#privateMessageTabs a[href="#' + recipient + '"]').tab('show');
      }
      else
      {
        // Add a new tab for the private message
        $("<li><a href='#" + recipient + "' tabindex='-1' data-toggle='tab'>" + recipient + "</a></li>")
            .appendTo('#privateMessageTabs');

        // Add a new tab-pane for the private message
        var PMTab = $($('.privateMessageTemplate').html())
            .attr('id', recipient)
            .appendTo('.tab-content');

        PMTab.find(".panel-title").html("Private Message with " + recipient);
        PMTab.find("textarea").attr("data-messagetype", "SEND " + recipient);

        // Make new private message screen active
        $('#privateMessageTabs a[href="#' + recipient + '"]').tab('show');

        // Add a click handler for the Send PM button
        PMTab.find(".sendPMButton").click(send_to_server);
      }

      if (message)
      {
        add_message(PMTab.find(".output"), message);
      }
    }
  }
});
